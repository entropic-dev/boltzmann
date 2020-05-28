/* eslint-disable */
/* istanbul ignore file */
'use strict'

// 

const ship = require('culture-ships').random()
const querystring = require('querystring')
const { promisify } = require('util')
const isDev = require('are-we-dev')
const fmw = require('find-my-way')
const accepts = require('accepts')
const http = require('http')
const pino = require('pino')
const os = require('os')
// 
// 
const pg = require('pg')
// 
// {% block requirements %}
// {% endblock %}

const THREW = Symbol.for('threw')
const STATUS = Symbol.for('status')
const HEADERS = Symbol.for('headers')
// 

let ajv = null
let ajvLoose = null
let ajvStrict = null

async function main ({
  middleware = _requireOr('./middleware', []),
  bodyParsers = _requireOr('./body', [urlEncoded, json]),
  handlers = _requireOr('./handlers', {}),
} = {}) {
  const server = http.createServer()

  const handler = await buildMiddleware(middleware, router(handlers))
  Context._bodyParser = bodyParsers.reduceRight((lhs, rhs) => rhs(lhs), request => {
    throw Object.assign(new Error('Cannot parse request body'), {
      [STATUS]: 415
    })
  })

  server.on('request', async (req, res) => {
    let body = await handler(new Context(req, res))

    if (body[THREW]) {
      body = {
        message: body.message,
        [isDev() ? 'stack' : Symbol('stack')]: body.stack,
        [STATUS]: body[STATUS],
        [HEADERS]: body[HEADERS],
        ...body
      }
    }

    const isPipe = body && body.pipe
    const {
      [STATUS]: status,
      [HEADERS]: headers
    } = body || {}

    res.writeHead(status, headers || {})
    if (isPipe) {
      body.pipe(res)
    } else if (Buffer.isBuffer(body)) {
      res.end(body)
    } else if (body) {
      res.end(JSON.stringify(body))
    } else {
      res.end()
    }
  })

  return server
}

// - - - - - - - - - - - - - - - -
// Request Context
// - - - - - - - - - - - - - - - -

class Context {
  constructor(request, response) {
    this.request = request
    this.start = Date.now()
    this.params = null

    this.remote = request.socket
      ? request.socket.remoteAddress.replace('::ffff:', '')
      : request.remoteAddress
      ? request.remoteAddress
      : ''
    const [host, _] = request.headers['host'].split(':')
    this.host = host
    this._parsedUrl = null
    this._body = null
    this._accepts = null
    this._response = response // do not touch this
    this._routed = {}

    // 
    // 
    this._postgresPool = null
    this._postgresConnection = null
    // 
    // {% block context_constructor %}
    // {% endblock %}
  }

  // {% block context_body %}
  // {% endblock %}

  // 
  /** @type {Promise<pg.Client>} */
  get postgresClient () {
    this._postgresConnection = this._postgresConnection || this._postgresPool.connect()
    return this._postgresConnection
  }
  // 

  // 

  /** @type {string} */
  get method() {
    return this.request.method
  }

  /** @type {Object<string,string>} */
  get headers() {
    return this.request.headers
  }

  get url() {
    if (this._parsedUrl) {
      return this._parsedUrl
    }
    this._parsedUrl = new URL(this.request.url, 'http://example.com')
    return this._parsedUrl
  }

  get query () {
    return Object.fromEntries(this.url.searchParams)
  }

  /** @type {Promise<Object>} */
  get body () {
    if (this._body) {
      return this._body
    }
    this._body = Promise.resolve(Context._bodyParser(this.request))
    return this._body
  }

  get accepts () {
    if (this._accepts) {
      return this._accepts
    }
    this._accepts = accepts(this.request)
    return this._accepts
  }
}
Context._bodyParser = null

// - - - - - - - - - - - - - - - -
// Routing
// - - - - - - - - - - - - - - - -

function router (handlers) {
  const wayfinder = fmw({})

  for (let [key, handler] of Object.entries(handlers)) {
    if (typeof handler.route === 'string') {
      let [method, ...route] = handler.route.split(' ')
      route = route.join('')
      if (route.length === 0) {
        route = method
        method = (handler.method || 'GET')
      }
      const opts = {}
      if (handler.version) {
        opts.version = handler.version
      }

      const { version, decorators, ...rest } = handler
      if (Array.isArray(decorators)) {
        handler = decorators.reduceRight((lhs, rhs) => rhs(lhs), handler)
      }

      Object.assign(handler, {
        method,
        version,
        route,
        decorators: (decorators || []).map(xs => xs.name),
        ...rest
      })

      wayfinder.on(method, route, opts, handler)
    }
  }

  return function router (context) {
    const { pathname } = context.url
    const match = wayfinder.find(context.request.method, pathname, ...(
      context.request.headers['accept-version']
      ? [context.request.headers['accept-version']]
      : []
    ))

    if (!match) {
      throw Object.assign(new Error('Not found'), {
        [STATUS]: 404
      })
    }

    const {
      method,
      route,
      decorators,
      version
    } = match.handler

    context.params = match.params
    context._routed = {
      method,
      route,
      decorators,
      version,
      params: match.params
    }

    // 
      return match.handler(context, match.params, match.store, null)
      // 
  }
}

// - - - - - - - - - - - - - - - -
// Middleware
// - - - - - - - - - - - - - - - -

async function buildMiddleware (middleware, router) {
  const middlewareToSplice = (
    isDev()
    ? (mw) => [
      // 
      dev(mw),
      enforceInvariants()
    ]
    : (mw) => [
      // 
      enforceInvariants()
    ]
  )
  const result = middleware.reduce((lhs, rhs) => {
    const [mw, ...args] = Array.isArray(rhs) ? rhs : [rhs]
    return [...lhs, ...middlewareToSplice(mw), mw(...args)]
  }, []).concat(middlewareToSplice())

  // 
  return result.reduceRight(async (lhs, rhs) => {
    return rhs(await lhs)
  }, router)
}

const hangWarning = Symbol('hang-stall')
const hangError = Symbol('hang-error')

function dev(
  nextName,
  warnAt = Number(process.env.DEV_LATENCY_WARNING_MS) || 500,
  errorAt = Number(process.env.DEV_LATENCY_ERROR_MS) || 2000
) {
  return function devMiddleware (next) {
    return async function inner(context) {
      const req = context.request
      if (context[hangWarning]) {
        clearTimeout(context[hangWarning])
      }
      context[hangWarning] = setTimeout(() => {
        console.error(
          `⚠️ Response from ${nextName} > ${warnAt}ms fetching "${req.method} ${
            req.url
          }".`
        )
        console.error(
          '\x1b[037m - (Tune timeout using DEV_LATENCY_WARNING_MS env variable.)\x1b[00m'
        )
      }, warnAt)

      if (context[hangError]) {
        clearTimeout(context[hangError])
      }
      context[hangError] = setTimeout(() => {
        console.error(
          `🛑 STALL: Response from ${nextName} > ${errorAt}ms: "${req.method} ${
            req.url
          }". (Tune timeout using DEV_LATENCY_ERROR_MS env variable.)`
        )
        console.error(
          '\x1b[037m - (Tune timeout using DEV_LATENCY_ERROR_MS env variable.)\x1b[00m'
        )
      }, errorAt)

      const result = await next(context)
      clearTimeout(context[hangWarning])
      context[hangWarning] = null
      clearTimeout(context[hangError])
      context[hangError] = null
      return result
    }
  }
}

let isClosing = false
// When we're not in dev, kubernetes will let us know that it's closing time.
// Gracefully let open connections complete, but let them know not to keep-alive!
if (!isDev()) {
  process.on('SIGINT', () => {
    if (isClosing) {
      process.exit(1)
    }
    const logger = pino()
    logger.info('Caught SIGINT, preparing to shutdown. If running on the command line another ^C will close the app immediately.')
    isClosing = true
  })
}

function enforceInvariants () {
  return function invariantMiddleware (next) {
    return async function invariant (ctx) {
      let error, result

      try {
        result = await next(ctx)
      } catch (err) {
        error = err
      }

      const body = error || result || ''
      const isPipe = body && body.pipe

      const {
        [STATUS]: status = error ? 500 : result ? 200 : 204,
        [HEADERS]: headers = {}
      } = body || {}

      if (!headers['content-type']) {
        if (typeof body === 'string') {
          headers['content-type'] = 'text/plain; charset=utf-8'
        } else if (isPipe) {
          headers['content-type'] = 'application/octet-stream'
        } else {
          headers['content-type'] = 'application/json'
        }
      }

      if (!headers.connection) {
        headers.connection = isClosing ? 'close' : 'keep-alive'
      }

      if (error) {
        error[STATUS] = status
        error[HEADERS] = headers
        error[THREW] = true
        return error
      }

      if (result && typeof result === 'object') {
        result[STATUS] = status
        result[HEADERS] = headers
        return result
      }

      if (!result) {
        result = ''
      }

      const stream = Buffer.from(String(result), 'utf8')
      stream[STATUS] = status
      stream[HEADERS] = headers
      return stream
    }
  }
}

function logging ({ logger = pino({ prettyPrint: isDev() }) } = {}) {
  return function logMiddleware (next) {
    return async function inner (context) {
      const result = await next(context)

      const body = result || {}
      if (body && body[THREW] && body.stack) {
        logger.error(body)
      }

      logger.info({
        message: `${body[Symbol.for('status')]} ${context.request.method} ${
          context.request.url
        }`,
        id: context.id,
        ip: context.remote,
        host: context.host,
        method: context.request.method,
        url: context.request.url,
        elapsed: Date.now() - context.start,
        status: body[Symbol.for('status')],
        userAgent: context.request.headers['user-agent'],
        referer: context.request.headers.referer
      })

      return body
    }
  }
}

function json (next) {
  return async request => {
    if (request.headers['content-type'] !== 'application/json') {
      return next(request)
    }

    const buf = await _collect(request)
    try {
      return JSON.parse(String(buf))
    } catch {
      throw Object.assign(new Error('Could not parse request body as JSON'), {
        [STATUS]: 422
      })
    }
  }
}

function urlEncoded (next) {
  return async request => {
    if (request.headers['content-type'] !== 'application/x-www-form-urlencoded') {
      return next(request)
    }

    const buf = await _collect(request)
    // XXX: AFAICT there's no way to get the querystring parser to throw, hence
    // the lack of a try/catch here.
    return querystring.parse(String(buf))
  }
}

// 
// 
// 
function postgresMiddleware ({
  url = process.env.PGURL || 'postgres://postgres@localhost:5432/todo-api',
  max = Number(process.env.PGPOOLSIZE) || 20
} = {}) {
  return async next => {
    const pool = new pg.Pool({
      connectionString: url,
      max
    })

    // make sure we can connect.
    const testConn = await pool.connect()
    testConn.release()

    return async function postgres (context) {
      context._postgresPool = pool
      const isTransaction = context.method !== 'GET' && context.method !== 'HEAD'
      if (isTransaction) {
        const client = await context.postgresClient
        await client.query('BEGIN;')
      }

      const result = await next(context)
      if (context._postgresConnection) {
        const client = await context._postgresConnection
        if (isTransaction) {
          await client.query(result[THREW] ? 'ROLLBACK' : 'COMMIT')
        }
        await client.release()
      }
      return result
    }
  }
}
// 

function monitoringMiddleware ({
  git = process.env.GIT_COMMIT,
  reachability = {
    // 
    postgresReachability,
    // 
    // 
    // 
    // 
    ..._requireOr('./reachability', {})
  }
} = {}) {
  return next => {
    const hostname = os.hostname()
    let requestCount = 0
    const statuses = {}
    reachability = Object.entries(reachability)
    return async function monitor (context) {
      switch (context.url.pathname) {
        case '/monitor/status':
          const downstream = {}
          for (const [name, test] of reachability) {
            const meta = {status: 'failed', latency: 0, error: null}
            const start = Date.now()
            try {
              await test(context, meta)
              meta.status = 'healthy'
            } catch (err) {
              meta.error = err
            } finally {
              meta.latency = Date.now() - start
            }
            downstream[name] = meta
          }

          return {
            git,
            uptime: process.uptime(),
            service: 'todo-api',
            hostname,
            memory: process.memoryUsage(),
            downstream,
            stats: {
              requestCount,
              statuses
            }
          }

        default:
          ++requestCount
          const result = await next(context)
          const body = result || {}
          statuses[body[STATUS]] = statuses[body[STATUS]] || 0
          ++statuses[body[STATUS]]
          return result
      }
    }
  }
}

function ping () {
  return next => context => {
    if (context.url.pathname === '/monitor/ping') {
      return ship
    }
    return next(context)
  }
}

// - - - - - - - - - - - - - - - -
// Reachability Checks
// - - - - - - - - - - - - - - - -

// 
async function postgresReachability (context, meta) {
  const client = await context.postgresClient
  meta.status = 'got-client'
  await client.query('select 1;')
}
// 

// 
// 
// 

// - - - - - - - - - - - - - - - -
// Decorators
// - - - - - - - - - - - - - - - -
function validateBody(schema) {
  ajv = ajv || require('ajv')
  ajvStrict = ajvStrict || new ajv()
  const validator = ajvStrict.compile(schema)
  return function validate (next) {
    return async (context, ...args) => {
      const subject = await context.body
      const valid = validator(subject)
      if (!valid) {
        context._body = Promise.reject(Object.assign(
          new Error('Bad request'),
          { errors: validator.errors, [STATUS]: 400 }
        ))
        context._body.catch(() => {})
      } else {
        context._body = Promise.resolve(subject)
      }

      return next(context, ...args)
    }
  }
}

function validateBlock(what) {
  return schema => {
    ajv = ajv || require('ajv')
    ajvLoose = ajvLoose || new ajv({ coerceTypes: true })
    const validator = ajvLoose.compile(schema)
    return function validate (next) {
      return async (context, params, ...args) => {
        const subject = what(context, params)
        const valid = validator(subject)
        if (!valid) {
          return Object.assign(new Error('Bad request'), {
            [THREW]: true,
            [STATUS]: 400,
            errors: validator.errors
          })
        }

        return next(context, params, ...args)
      }
    }
  }
}

let savepointId = 0

function test ({
  middleware = [],
  handlers = _requireOr('./handlers', {}),
  bodyParsers = _requireOr('./body', [urlEncoded, json]),
  after = require('tap').teardown
}) {
  const shot = require('@hapi/shot')
  // 
  const database = process.env.TEST_DB_NAME || 'todo-api_test'
  const postgresClient = new pg.Client({
    connectionString: `postgres://localhost:5432/${database}`
  })
  postgresClient.connect()
  // 

  // 

  // 
  // 

  after(() => {
    // 
    postgresClient.end()
    // 
    // 
    // 
    // 
  })

  return inner => async assert => {
    // 
    // if we're in postgres, run the test in a transaction, run
    // routes in checkpoints.
    await postgresClient.query(`begin`)

    middleware.push(() => next => async context => {
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
    // 
    // 

    // 
    // 
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
      // 
      await postgresClient.query('rollback')
      // 
      // 
      // 
    }
  }
}

// - - - - - - - - - - - - - - - -
// Utilities
// - - - - - - - - - - - - - - - -
async function _collect (request) {
  const acc = []
  for await (const chunk of request) {
    acc.push(chunk)
  }
  return Buffer.concat(acc)
}

function _requireOr (target, value) {
  try {
    return require(target)
  } catch (err) {
    if (
      err.code === 'MODULE_NOT_FOUND' &&
      err.requireStack &&
      err.requireStack[0] === __filename
    ) {
      return value
    }
    throw err
  }
}

async function go(promiselike) {
  try {
    return [null, await promiselike]
  } catch (err) {
    return [err, null]
  }
}

function err2http (type, status, headers = null) {
  return (err) => {
    if (err instanceof type) {
      err[Symbol.for('status')] = status
      if (headers) {
        err[Symbol.for('headers')] = {
          ...(err[Symbol.for('headers')] || {}),
          headers
        }
      }
    }
    throw err
  }
}

exports.go = go
exports.err2http = err2http
exports.Context = Context
exports.main = main
exports.body = {
  json,
  urlEncoded
}
exports.decorators = {
  err2http: (...config) => {
    const cast = err2http(...config)
    return next => async (...args) => {
      try {
        return next(...args)
      } catch (err) {
        cast(err)
      }
    }
  },
  validate: {
    body: validateBody,
    query: validateBlock(ctx => ctx.query),
    params: validateBlock((_, params) => params)
  },
  test
}

// 
if (require.main === module) {
  const runtimeMiddleware = [
    // {% block runtime_middleware %}
    // 
    ping,
    logging,
    // 
    // 
    postgresMiddleware,
    // 
    // {% endblock %}
  ]
  main({
    middleware: [
      ...runtimeMiddleware,
      ..._requireOr('./middleware', []),
      ...[monitoringMiddleware]
    ]
  }).then(server => {
    server.listen(Number(process.env.PORT) || 5000)
  }).catch(err => {
    console.error(err.stack)
    process.exit(1)
  })
}
// 
