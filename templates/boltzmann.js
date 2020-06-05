#!/usr/bin/env node
{% if not selftest %}/* eslint-disable */{% endif %}
{% if not selftest %}/* istanbul ignore file */{% endif %}

'use strict'

const serviceName = (
  process.env.SERVICE_NAME ||
  require('./package.json').name.split('/').pop()
)

// {% if honeycomb %}
const beeline = require('honeycomb-beeline')({
  writeKey: process.env.HONEYCOMBIO_WRITE_KEY,
  dataset: process.env.HONEYCOMBIO_DATASET,
  serviceName
})
const onHeaders = require('on-headers')
// {% endif %}

// {% if ping %}
const ship = require('culture-ships').random()
// {% endif %}
const querystring = require('querystring')
const { promisify } = require('util')
const isDev = require('are-we-dev')
const fmw = require('find-my-way')
const accepts = require('accepts')
const fs = require('fs').promises
const http = require('http')
const bole = require('bole')
const os = require('os')
// {% if redis %}
const redis = require('handy-redis')
// {% endif %}
// {% if postgres %}
const pg = require('pg')
// {% endif %}

const THREW = Symbol.for('threw')
const STATUS = Symbol.for('status')
const HEADERS = Symbol.for('headers')
// {% if honeycomb %}
const TRACE_HTTP_HEADER = 'x-honeycomb-trace'
// {% endif %}

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

    // {% if redis %}
    this._redisClient = null
    // {% endif %}
    // {% if postgres %}
    this._postgresPool = null
    this._postgresConnection = null
    // {% endif %}
  }

  // {% if postgres %}
  /** @type {Promise<pg.Client>} */
  get postgresClient () {
    this._postgresConnection = this._postgresConnection || this._postgresPool.connect()
    return this._postgresConnection
  }
  // {% endif %}

  // {% if redis %}
  /** @type {redis.IHandyRedis} */
  get redisClient () {
    return this._redisClient
  }
  // {% endif %}

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

      const { version, middleware, decorators, ...rest } = handler
      if (Array.isArray(decorators)) {
        handler = decorators.reduceRight((lhs, rhs) => rhs(lhs), handler)
      }

      if (Array.isArray(middleware)) {
        handler = buildMiddleware(middleware, handler)
      }

      Object.assign(handler, {
        ...rest,
        method,
        version,
        route,
        decorators: (decorators || []).map(xs => xs.name),
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

    context._routed = {
      method,
      route,
      decorators,
      version,
      params: match.params
    }
    context.params = match.params

    // {% if honeycomb %}
    let span = null
    if (process.env.HONEYCOMBIO_WRITE_KEY) {
      span = beeline.startSpan({
        name: `handler: ${match.handler.name}`,
        'handler.name': match.handler.name,
        'handler.method': String(method),
        'handler.route': route,
        'handler.version': version || '*',
        'handler.decorators': String(decorators)
      })
    }

    try {
      // {% endif %}
      return match.handler(context, match.params, match.store, null)
      // {% if honeycomb %}
    } finally {
      if (process.env.HONEYCOMBIO_WRITE_KEY) {
        beeline.finishSpan(span)
      }
    }
    // {% endif %}
  }
}

// - - - - - - - - - - - - - - - -
// Middleware
// - - - - - - - - - - - - - - - -

async function buildMiddleware (middleware, router) {
  const middlewareToSplice = (
    isDev()
    ? (mw) => [
      // {% if honeycomb %}
      honeycombMiddlewareSpans(mw),
      // {% endif %}
      dev(mw),
      enforceInvariants()
    ]
    : (mw) => [
      // {% if honeycomb %}
      honeycombMiddlewareSpans(mw),
      // {% endif %}
      enforceInvariants()
    ]
  )
  const result = middleware.reduce((lhs, rhs) => {
    const [mw, ...args] = Array.isArray(rhs) ? rhs : [rhs]
    return [...lhs, ...middlewareToSplice(mw), mw(...args)]
  }, []).concat(middlewareToSplice({ name: 'router' }))

  // {% if honeycomb %}
  // drop the outermost honeycombMiddlewareSpans mw.
  result.shift()
  // {% endif %}
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
    const logger = bole()
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

function handleCORS ({
  origins = [],
  methods = [],
  headers = []
}) {
  return next => {
    return function cors (context) {
      if (context.request.method === 'OPTIONS') {
        return {
          [Symbol.for('headers')]: {
            'Access-Control-Allow-Origin': origins,
            'Access-Control-Allow-Methods': methods,
            'Access-Control-Allow-Headers': headers
          }
        }
      }

      return next(context)
    }
  }
}

function applyXFO ({ mode = 'DENY' } = {}) {
  return next => {
    return async function xfo (context) {
      const result = await next(context)
      result[Symbol.for('headers')]['x-frame-options'] = mode
      return result
    }
  }
}

// {% if jwt %}
function authenticateJWT ({
  scheme = 'Bearer',
  publicKey = process.env.AUTHENTICATION_KEY,
  algorithms=['RS256'],
  storeAs = 'user'
} = {}) {
  const verifyJWT = require('jsonwebtoken').verify

  return async next => {
    const publicKeyContents = (
      String(publicKey)[0] === '/'
      ? await fs.readFile(publicKey).catch(err => {
        console.error(`
          boltzmann authenticateJWT middleware cannot read public key at "${publicKey}".
          Is the AUTHENTICATION_KEY environment variable set correctly?
          Is the file readable?
        `.trim().split('\n').join(' '))
        throw err
      })
      : publicKey
    )

    return async context => {
      if (!context.headers.authorization) {
        return next(context)
      }

      if (!context.headers.authorization.startsWith(`${scheme} `)) {
        return next(context)
      }

      const token = context.headers.authorization.slice(scheme.length + 1)
      let data = null
      try {
        data = await new Promise((resolve, reject) => {
          verifyJWT(token, publicKeyContents, {algorithms}, (err, data) => {
            err ? reject(err) : resolve(data)
          })
        })
      } catch (err) {
        const logger = bole('jwt')
        logger.error(err)
        throw Object.assign(new Error('Invalid bearer token'), {
          [Symbol.for('status')]: 403
        })
      }

      context[storeAs] = data
      return next(context)
    }
  }
}
// {% endif %}

function log ({
  logger = bole(process.env.SERVICE_NAME || 'boltzmann'),
  level = process.env.LOG_LEVEL || 'debug',
  stream = process.stdout
} = {}) {
  return function logMiddleware (next) {
    if (isDev()) {
      const pretty = require('bistre')({ time: true })
      pretty.pipe(stream)
      stream = pretty
    }
    bole.output({ level, stream })

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
    if (String(request.headers['content-type']).split(';')[0].trim() === 'application/json') {
      const buf = await _collect(request)
      try {
        return JSON.parse(String(buf))
      } catch {
        throw Object.assign(new Error('Could not parse request body as JSON'), {
          [STATUS]: 422
        })
      }
    }

    return next(request)
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

// {% if honeycomb %}
function trace ({
  headerSources = [TRACE_HTTP_HEADER, 'x-request-id'],
  parentRequestHeader = 'floop'
} = {}) {
  if (!process.env.HONEYCOMBIO_WRITE_KEY) {
    return next => context => next(context)
  }

  const schema = require('honeycomb-beeline/lib/schema')
  const tracker = require('honeycomb-beeline/lib/async_tracker')

  return function honeycombTrace (next) {
    return context => {
      const traceContext = _getTraceContext(context)
      const req = context.request
      const trace = beeline.startTrace({
        [schema.EVENT_TYPE]: 'boltzmann',
        [schema.PACKAGE_VERSION]: '1.0.0',
        [schema.TRACE_SPAN_NAME]: `${context.method} ${context.url.pathname}${context.url.search}`,
        [schema.TRACE_ID_SOURCE]: traceContext.source,
        'request.host': context.host,
        'request.original_url': context.url.href,
        'request.remote_addr': context.remote,
        'request.method': context.method,
        'request.scheme': context.url.protocol,
        'request.path': context.url.pathname,
        'request.query': context.url.search
      },
      traceContext.traceId,
      traceContext.parentSpanId,
      traceContext.dataset)

      if (traceContext.customContext) {
        beeline.addContext(traceContext.customContext)
      }

      if (!trace) {
        return next(context)
      }

      const boundFinisher = beeline.bindFunctionToTrace(response => {
        beeline.addContext({
          'response.status_code': String(response.statusCode)
        })

        if (context._routed) {
          beeline.addContext({
            'request.route': context._routed.route,
            'request.method': context._routed.method,
            'request.decorators': context._routed.decorators,
            'request.version': context._routed.version
          })
          if (context._routed.params) {
            const params = Object.entries(context._routed.params).map(([key, value]) => {
              return [`request.param.${key}`, value]
            })
            beeline.addContext(Object.fromEntries(params))
          }
        }

        beeline.finishTrace(trace)
      })

      // do not do as I do,
      onHeaders(context._response, function () {
        return boundFinisher(this, tracker.getTracked())
      })

      return next(context)
    }
  }

  function _getTraceContext (context) {
    const source = headerSources.find(header => header in context.headers)

    if (!source || !context.headers[source]) {
      return {}
    }

    if (source === TRACE_HTTP_HEADER) {
      const data = beeline.unmarshalTraceContext(context.headers[source])

      if (!data) {
        return {}
      }

      return Object.assign({}, data, { source: `${source} http header` })
    }

    return {
      traceId: context.headers[source],
      source: `${source} http header`
    }
  }
}

function honeycombMiddlewareSpans ({name} = {}) {
  if (!process.env.HONEYCOMBIO_WRITE_KEY) {
    return next => context => next(context)
  }

  return function honeycombSpan (next) {
    return async context => {
      const span = beeline.startSpan({
        name: `mw: ${name}`
      })

      // Assumption: the invariant middleware between each layer
      // will ensure that no errors are thrown from next().
      const result = await next(context)
      beeline.finishSpan(span)
      return result
    }
  }
}

// {% endif %}
// {% if redis %}
function attachRedis ({ url = process.env.REDIS_URL } = {}) {
  return next => {
    const client = redis.createHandyClient({ url })
    return async function redis (context) {
      context._redisClient = client
      return next(context)
    }
  }
}
// {% endif %}
// {% if postgres %}
function attachPostgres ({
  url = process.env.PGURL || `postgres://postgres@localhost:5432/${serviceName}`,
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
// {% endif %}

// {% if status %}
function handleStatus ({
  git = process.env.GIT_COMMIT,
  reachability = {
    // {% if postgres %}
    postgresReachability,
    // {% endif %}
    // {% if redis %}
    redisReachability,
    // {% endif %}
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
            service: serviceName,
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
// {% endif %}

// {% if ping %}
function handlePing () {
  return next => context => {
    if (context.url.pathname === '/monitor/ping') {
      return ship
    }
    return next(context)
  }
}
// {% endif %}

// {% if postgres or redis %}
// - - - - - - - - - - - - - - - -
// Reachability Checks
// - - - - - - - - - - - - - - - -
// {% endif %}
// {% if postgres %}
async function postgresReachability (context, meta) {
  const client = await context.postgresClient
  meta.status = 'got-client'
  await client.query('select 1;')
}
// {% endif %}

// {% if redis %}
async function redisReachability (context, meta) {
  await context.redisClient.ping()
}
// {% endif %}

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

function tupleResponse() {
  return function mapTupleResponse (next) {
    return async (context, ...args) => {
      let response = null
      try {
        response = await next(context, ...args)
      } catch (err) {
        response = err
        response[THREW] = true
      }

      if (Array.isArray(response)) {
        const [body, status = 200, headers = {}] = response
        body[THREW] = response[THREW]
        body[STATUS] = status
        body[HEADERS] = headers

        return body
      }

      return response
    }
  }
}

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
  middleware.push(() => next => async context => {
    context._redisClient = redisClient
    return next(context)
  })
  assert.redisClient = redisClient
  // {% endif %}

  // {% if postgres or redis %}
  after(() => {
    // {% if postgres %}
    postgresClient.end()
    // {% endif %}
    // {% if redis %}
    redisClient.end()
    // {% endif %}
  })
  // {% endif %}

  return inner => async assert => {
    // {% if postgres %}
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
    // {% endif %}
    // {% if redis %}
    await redisClient.flushdb()
    middleware.push(() => next => async context => {
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

exports.Context = Context
exports.main = main
exports.body = {
  json,
  urlEncoded
}
exports.decorators = {
  validate: {
    body: validateBody,
    query: validateBlock(ctx => ctx.query),
    params: validateBlock((_, params) => params)
  },
  test
}
exports.middleware = {
// {% if jwt %}
  authenticateJWT,
// {% endif %}
  handleCORS,
  applyXFO,
}

// {% if not selftest %}
if (require.main === module) {
  main({
    middleware: [
      // {% if honeycomb %}
      trace,
      // {% endif %}
      // {% if ping %}
      handlePing,
      // {% endif %}
      log,

      // {% if redis %}
      attachRedis,
      // {% endif %}
      // {% if postgres %}
      attachPostgres,
      // {% endif %}
      ..._requireOr('./middleware', []),
      // {% if status %}
      ...[handleStatus]
      // {% endif %}
    ]
  }).then(server => {
    server.listen(Number(process.env.PORT) || 5000)
  }).catch(err => {
    console.error(err.stack)
    process.exit(1)
  })
}
// {% else %}

/* istanbul ignore next */
{
  const { promises: fs, createReadStream } = require('fs')
  const shot = require('@hapi/shot')
  const { test } = require('tap')
  const path = require('path')

  test('_requireOr only returns default for top-level failure', async assert => {
    await fs.writeFile(path.join(__dirname, 'require-or-test'), 'const x = require("does-not-exist")')

    try {
      _requireOr('./require-or-test', [])
      assert.fail('expected to fail with MODULE_NOT_FOUND')
    } catch (err) {
      assert.equals(err.code, 'MODULE_NOT_FOUND')
    }
  })

  test('_requireOr returns default if toplevel require fails', async assert => {
    const expect = {}
    assert.equals(_requireOr('./d-n-e', expect), expect)
  })

  test('_collect takes a stream and returns a promise for a buffer of its content', async assert => {
    const result = await _collect(createReadStream(__filename))
    const expect = await fs.readFile(__filename)

    assert.equals(String(result), String(expect))
  })

  test('empty server; router handles 404', async assert => {
    const server = await main({
      middleware: [],
      bodyParsers: [],
      handlers: {
      }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/'
    })

    assert.equals(response.statusCode, 404)
    const parsed = JSON.parse(response.payload)
    assert.equals(parsed.message, 'Not found')

    if (isDev()) {
      assert.ok('stack' in parsed)
    }
  })

  test('200 ok: json; returns expected headers and response', async assert => {
    const handler = () => {
      return {message: 'hello world'}
    }
    handler.route = 'GET /'
    const server = await main({
      middleware: [],
      bodyParsers: [],
      handlers: {
        handler
      }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/'
    })

    assert.equals(response.statusCode, 200)
    const parsed = JSON.parse(response.payload)
    assert.equals(response.headers['content-type'], 'application/json')
    assert.same(parsed, {message: 'hello world'})
  })

  test('200 ok: string; returns expected headers and response', async assert => {
    const handler = () => {
      return 'hi there'
    }
    handler.route = 'GET /'
    const server = await main({
      middleware: [],
      bodyParsers: [],
      handlers: {
        handler
      }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/'
    })

    assert.equals(response.statusCode, 200)
    assert.equals(response.headers['content-type'], 'text/plain; charset=utf-8')
    assert.same(response.payload, 'hi there')
  })

  test('204 no content', async assert => {
    const handler = () => {
    }
    handler.route = 'GET /'
    const server = await main({
      middleware: [],
      bodyParsers: [],
      handlers: {
        handler
      }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/'
    })

    assert.equals(response.statusCode, 204)
    assert.same(response.payload, '')
  })

  test('throwing an error results in 500 internal server error', async assert => {
    const handler = () => {
      throw new Error('wuh oh')
    }
    handler.route = 'GET /'
    const server = await main({
      middleware: [],
      bodyParsers: [],
      handlers: {
        handler
      }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/'
    })

    assert.equals(response.statusCode, 500)
    const parsed = JSON.parse(response.payload)
    assert.equals(response.headers['content-type'], 'application/json')
    assert.equals(parsed.message, 'wuh oh')

    if (isDev()) {
      assert.ok('stack' in parsed)
    }
  })

  test('throwing an error in non-dev mode results in 500 internal server error w/no stack', async assert => {
    const handler = () => {
      throw new Error('wuh oh')
    }
    handler.route = 'GET /'
    const server = await main({
      middleware: [],
      bodyParsers: [],
      handlers: {
        handler
      }
    })

    process.env.NODE_ENV = 'prod'
    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/'
    })

    assert.equals(response.statusCode, 500)
    const parsed = JSON.parse(response.payload)
    assert.equals(response.headers['content-type'], 'application/json')
    assert.equals(parsed.message, 'wuh oh')

    assert.ok(!('stack' in parsed))
  })

  test('reset env', async assert => {
    process.env.NODE_ENV = 'test'
  })

  test('return a pipe-able response', async assert => {
    const { Readable } = require('stream')

    const handler = () => {
      const chunks = ['hi ', 'there ', 'world', null]
      return new Readable({
        read () {
          const next = chunks.shift()
          if (next !== undefined) {
            this.push(next)
          }
        }
      })
    }
    handler.route = 'GET /'
    const server = await main({
      middleware: [],
      bodyParsers: [],
      handlers: {
        handler
      }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/'
    })

    assert.equals(response.statusCode, 200)
    assert.equals(response.headers['content-type'], 'application/octet-stream')
    assert.equals(response.payload, 'hi there world')
  })

  test('context: has expected properties', async assert => {
    const mockRequest = {
      socket: {
        remoteAddress: '::80'
      },
      headers: {
        host: 'example.com:443',
        accept: 'text/plain;q=0.9, text/html;q=0.8'
      },
      url: 'https://example.com/hello?there=1',
      method: 'PROPFIND'
    }
    const now = Date.now()
    const ctx = new Context(mockRequest)

    assert.ok(ctx.start >= now)
    assert.equals(ctx.host, 'example.com')
    assert.equals(ctx.url.pathname, '/hello')
    assert.equals(ctx.query.there, '1')

    ctx._parsedUrl = {'pathname': '/floo'}
    assert.equals(ctx.url.pathname, '/floo')
    assert.equals(ctx.headers, ctx.request.headers)
    assert.equals(ctx.method, ctx.request.method)

    assert.equals(ctx.accepts.type(['text/html', 'text/plain', 'application/json']), 'text/plain')

    ctx._accepts = accepts({headers: {accept: '*/*'}})
    assert.equals(ctx.accepts.type(['text/html', 'text/plain', 'application/json']), 'text/html')
  })

  test('context: default body parser returns 415', async assert => {
    const handler = async context => {
      await context.body
    }
    handler.route = 'GET /'
    const server = await main({
      middleware: [],
      bodyParsers: [],
      handlers: {
        handler
      }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/'
    })

    assert.equals(response.statusCode, 415)
    assert.equals(JSON.parse(response.payload).message, 'Cannot parse request body')
  })

  test('json body: returns 415 if request is not application/json', async assert => {
    const handler = async context => {
      await context.body
    }
    handler.route = 'GET /'
    const server = await main({
      middleware: [],
      bodyParsers: [json],
      handlers: {
        handler
      }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/'
    })

    assert.equals(response.statusCode, 415)
    assert.equals(JSON.parse(response.payload).message, 'Cannot parse request body')
  })

  test('json body: returns 422 if request is application/json but contains bad json', async assert => {
    const handler = async context => {
      await context.body
    }
    handler.route = 'GET /'
    const server = await main({
      middleware: [],
      bodyParsers: [json],
      handlers: {
        handler
      }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/',
      headers: {
        'content-type': 'application/json'
      },
      payload: 'dont call me json'
    })

    assert.equals(response.statusCode, 422)
    assert.equals(JSON.parse(response.payload).message, 'Could not parse request body as JSON')
  })

  test('json body: returns json if request is application/json', async assert => {
    const handler = async context => {
      return await context.body
    }
    handler.route = 'GET /'
    const server = await main({
      middleware: [],
      bodyParsers: [json],
      handlers: {
        handler
      }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/',
      headers: {
        'content-type': 'application/json'
      },
      payload: JSON.stringify({hello: 'world'})
    })

    assert.equals(response.statusCode, 200)
    assert.same(JSON.parse(response.payload), {hello: 'world'})
  })

  test('urlEncoded body: returns 415 if request is not application/x-www-form-urlencoded', async assert => {
    const handler = async context => {
      await context.body
    }
    handler.route = 'GET /'
    const server = await main({
      middleware: [],
      bodyParsers: [urlEncoded],
      handlers: {
        handler
      }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/'
    })

    assert.equals(response.statusCode, 415)
    assert.equals(JSON.parse(response.payload).message, 'Cannot parse request body')
  })

  test('urlEncoded body: returns urlEncoded if request is application/x-www-form-urlencoded', async assert => {
    const handler = async context => {
      return await context.body
    }
    handler.route = 'GET /'
    const server = await main({
      middleware: [],
      bodyParsers: [urlEncoded],
      handlers: {
        handler
      }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload: querystring.stringify({hello: 'world'})
    })

    assert.equals(response.statusCode, 200)
    assert.same(JSON.parse(response.payload), {hello: 'world'})
  })

  test('jwt ignores requests without authorization header', async assert => {
    let called = 0
    const handler = await authenticateJWT()(context => {
      ++called
      return 'ok'
    })

    const result = await handler({headers: {}})

    assert.equal(called, 1)
    assert.equal(result, 'ok')
  })

  test('jwt ignores requests with authorization header that do not match configured scheme', async assert => {
    let called = 0
    const handler = await authenticateJWT()(context => {
      ++called
      return 'ok'
    })

    const result = await handler({
      headers: {
        authorization: 'Boggle asfzxcdofj' // the Boggle-based authentication scheme
      }
    })

    assert.equal(called, 1)
    assert.equal(result, 'ok')
  })

  test('jwt validates and attaches payload for valid jwt headers', async assert => {
    const crypto = require('crypto')
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      }
    })

    const jsonwebtoken = require('jsonwebtoken')
    const blob = await new Promise((resolve, reject) => {
      jsonwebtoken.sign({
        ifItFits: 'iSits'
      }, privateKey, {
        algorithm: 'RS256',
        noTimestamp: true
      }, (err, data) => err ? reject(err) : resolve(data))
    })

    let called = 0
    const handler = await authenticateJWT({publicKey})(context => {
      ++called
      return context.user
    })

    const result = await handler({
      headers: {
        authorization: `Bearer ${blob}`
      }
    })

    assert.equal(called, 1)
    assert.same(result, {ifItFits: 'iSits'})
  })

  test('jwt throws a 403 for valid jwt token using incorrect algo', async assert => {
    const crypto = require('crypto')
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      }
    })

    const jsonwebtoken = require('jsonwebtoken')
    const blob = await new Promise((resolve, reject) => {
      jsonwebtoken.sign({
        ifItFits: 'iSits'
      }, privateKey, {
        algorithm: 'HS256'
      }, (err, data) => err ? reject(err) : resolve(data))
    })

    let called = 0
    const handler = await authenticateJWT({publicKey})(context => {
      ++called
      return context.user
    })

    try {
      await handler({
        headers: {
          authorization: 'Bearer banana' // WHO WOULDN'T WANT A BANANA, I ASK YOU
        }
      })
      assert.fail('expected failure, unexpected success. not cause for celebration')
    } catch (err) {
      assert.equal(called, 0)
      assert.equal(err[Symbol.for('status')], 403)
    }
  })

  test('jwt throws a 403 for invalid jwt headers', async assert => {
    let called = 0
    const handler = await authenticateJWT()(context => {
      ++called
      return 'ok'
    })

    try {
      await handler({
        headers: {
          authorization: 'Bearer banana' // WHO WOULDN'T WANT A BANANA, I ASK YOU
        }
      })
      assert.fail('expected failure, unexpected success. not cause for celebration')
    } catch (err) {
      assert.equal(called, 0)
      assert.equal(err[Symbol.for('status')], 403)
    }
  })

  test('log: logs expected keys', async assert => {
    const logged = []
    let handler = null
    const middleware = log({
      logger: {
        info (what) {
          logged.push(['info', what])
        },
        error (what) {
          logged.push(['error', what])
        }
      }
    })(context => handler(context))

    handler = () => {
      return {[STATUS]: 202, result: 'ok'}
    }
    await middleware({
      request: {
        method: 'GET',
        url: '/bloo',
        headers: {}
      },
      start: 0
    })

    assert.equal(logged.length, 1)
    assert.equal(logged[0][0], 'info')
    assert.equal(logged[0][1].message, '202 GET /bloo')
    assert.equal(logged[0][1].status, 202)
    assert.ok('userAgent' in logged[0][1])
    assert.ok('referer' in logged[0][1])
    assert.ok('elapsed' in logged[0][1])
    assert.ok('url' in logged[0][1])
    assert.ok('host' in logged[0][1])
    assert.ok('ip' in logged[0][1])

    handler = () => {
      return Object.assign(new Error('foo'), {[THREW]: true})
    }
    await middleware({
      request: {
        method: 'GET',
        url: '/bloo',
        headers: {}
      },
      start: 0
    })

    assert.equal(logged.length, 3)
    assert.equal(logged[1][0], 'error')
    assert.equal(logged[1][1].message, 'foo')
    assert.equal(logged[2][0], 'info')
  })

  test('validate.query decorator returns 400 on bad query param', async assert => {
    const decor = exports.decorators.validate.query({
      type: 'object',
      required: ['param'],
      properties: {
        param: {
          format: 'email'
        }
      }
    })(() => {
      return 'ok'
    })


    const result = await decor({
      query: {}
    })

    assert.equal(result[STATUS], 400)
  })
}
// {% endif %}
