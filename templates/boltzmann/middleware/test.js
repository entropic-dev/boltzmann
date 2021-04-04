
let savepointId = 0

function test ({
  middleware = [],
  handlers = _requireOr('./handlers'),
  bodyParsers = _requireOr('./body', [urlEncoded, json]),
  after = require('tap').teardown
}) {
  const shot = require('@hapi/shot')
  // {% if postgres %}
  const database = process.env.TEST_DB_NAME || `${serviceName}_test`
  const postgresClient = new pg.Client({
    connectionString: process.env.PGURL || `postgres://localhost:5432/${database}`
  })
  postgresClient.connect()
  // {% endif %}

  // {% if redis %}
  const redisClient = redis.createHandyClient(`redis://localhost:6379/7`)
  middleware = Promise.resolve(middleware).then(mw => {
    mw.push(() => next => async context => {
      context._redisClient = redisClient
      return next(context)
    })

    return mw
  })
  // {% endif %}

  // {% if postgres or redis %}
  after(() => {
    // {% if postgres %}
    postgresClient.end()
    // {% endif %}
    // {% if redis %}
    redisClient.quit()
    // {% endif %}
  })
  // {% endif %}

  return inner => async assert => {
    [handlers, bodyParsers, middleware] = await Promise.all([handlers, bodyParsers, middleware])
    // {% if redis %}
    assert.redisClient = redisClient
    // {% endif %}

    // {% if postgres %}
    // if we're in postgres, run the test in a transaction, run
    // routes in checkpoints.
    await postgresClient.query(`begin`)

    middleware.unshift(() => next => async context => {
      context._postgresConnection = postgresClient
      const savepointname = `test_${process.pid}_${Date.now()}_${savepointId++}`
      const isTransactional = context.method !== 'GET' && context.method !== 'HEAD'
      if (isTransactional) {
        await postgresClient.query(`savepoint ${savepointname}`)
      }

      const result = await next(context)
      if (isTransactional) {
        if ((result || {})[THREW]) {
          await postgresClient.query(`rollback to savepoint ${savepointname}`)
        } else {
          await postgresClient.query(`release savepoint  ${savepointname}`)
        }
      }

      return result
    })
    assert.postgresClient = postgresClient
    // {% endif %}
    // {% if redis %}
    await redisClient.flushdb()
    middleware.unshift(() => next => async context => {
      context._redisClient = redisClient
      return next(context)
    })
    assert.redisClient = redisClient
    // {% endif %}

    const server = await main({ middleware, bodyParsers, handlers })
    const [onrequest] = server.listeners('request')
    const request = async ({
      method = 'GET',
      url = '/',
      headers,
      body,
      payload,
      ...opts
    } = {}) => {
      headers = headers || {}
      payload = payload || body
      if (!Buffer.isBuffer(payload) && typeof payload !== 'string' && payload) {
        payload = JSON.stringify(payload)
        headers['content-type'] = 'application/json'
      }

      const response = await shot.inject(onrequest, {
        method,
        url,
        headers,
        payload,
        ...opts
      })

      Object.defineProperty(response, 'json', {
        get () {
          return JSON.parse(this.payload)
        }
      })

      return response
    }
    assert.request = request

    try {
      await inner(assert, request)
    } finally {
      // {% if postgres %}
      await postgresClient.query('rollback')
      // {% endif %}
    }
  }
}
