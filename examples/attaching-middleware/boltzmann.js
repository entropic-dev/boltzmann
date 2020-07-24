#!/usr/bin/env node
/* eslint-disable */
/* istanbul ignore file */

'use strict'

const serviceName = (
  process.env.SERVICE_NAME ||
  require('./package.json').name.split('/').pop()
)

// 

const ships = require('culture-ships')
// 
const ship = ships.random()
// 
const querystring = require('querystring')
const { promisify } = require('util')
const isDev = require('are-we-dev')
const fmw = require('find-my-way')
const accepts = require('accepts')
const fs = require('fs').promises
// 
const http = require('http')
const bole = require('bole')
const os = require('os')
// 
// 

const THREW = Symbol.for('threw')
const STATUS = Symbol.for('status')
const HEADERS = Symbol.for('headers')
const TEMPLATE = Symbol.for('template')
const TRACE_HTTP_HEADER = 'x-honeycomb-trace'

let ajv = null
let ajvLoose = null
let ajvStrict = null

async function main ({
  middleware = _processMiddleware(_requireOr('./middleware', [])),
  bodyParsers = _requireOr('./body', [urlEncoded, json]),
  handlers = _requireOr('./handlers', {}),
} = {}) {
  const server = http.createServer()

  const handler = await buildMiddleware(middleware, await router(handlers))
  Context._bodyParser = bodyParsers.reduceRight((lhs, rhs) => rhs(lhs), request => {
    throw Object.assign(new Error('Cannot parse request body'), {
      [STATUS]: 415
    })
  })

  server.on('request', async (req, res) => {
    const context = new Context(req, res)
    let body = await handler(context)

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
      [HEADERS]: headers,
    } = body || {}

    if (context._cookie) {
      const setCookie = context._cookie.collect()
      if (setCookie.length) {
        headers['set-cookie'] = setCookie
      }
    }

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
    this.id = request.headers[TRACE_HTTP_HEADER] || request.headers['x-request-id'] || ships.random()
    this._cookie = null

    // 
    // 
  }

  // 

  get cookie () {
    this._cookie = this._cookie || Cookie.from(this.headers.cookie || '')
    return this._cookie
  }

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

  set url(value) {
    this._parsedUrl = null
    this.request.url = value
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

async function router (handlers) {
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
        handler = decorators.reduce((lhs, rhs) => {
          return [...lhs, enforceInvariants(), rhs]
        }, []).reduceRight((lhs, rhs) => rhs(lhs), enforceInvariants()(handler))
      }

      if (Array.isArray(middleware)) {
        handler = await buildMiddleware(middleware, handler)
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
  }, []).concat(middlewareToSplice({ name: 'router' }))

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
    const logger = bole()
    logger.info('Caught SIGINT, preparing to shutdown. If running on the command line another ^C will close the app immediately.')
    isClosing = true
  })
}

function enforceInvariants () {
  return function invariantMiddleware (next) {
    // the "...args" here are load-bearing: this is applied between
    // decorators _and_ middleware
    return async function invariant (ctx, ...args) {
      let error, result

      try {
        result = await next(ctx, ...args)
      } catch (err) {
        error = err
      }

      const body = error || result || ''
      const isPipe = body && body.pipe

      const {
        [STATUS]: status = error ? 500 : result ? 200 : 204,
        [HEADERS]: headers = {},
      } = body || {}

      if (!headers['content-type']) {
        if (typeof body === 'string') {
          headers['content-type'] = 'text/plain; charset=utf-8'
        } else if (isPipe) {
          headers['content-type'] = 'application/octet-stream'
        } else {
          // 
          headers['content-type'] = 'application/json; charset=utf-8'
          // 
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

// 

function handleCORS ({
  origins = isDev() ? '*' : String(process.env.CORS_ALLOW_ORIGINS).split(','),
  methods = String(process.env.CORS_ALLOW_METHODS).split(','),
  headers = String(process.env.CORS_ALLOW_HEADERS).split(',')
}) {
  origins = [].concat(origins)
  const includesStar = origins.includes('*')

  return next => {
    return async function cors (context) {
      if (!includesStar && !origins.includes(context.headers.origin)) {
        throw Object.assign(new Error('Origin not allowed'), {
          [Symbol.for('status')]: 400
        })
      }

      const response = (
        context.method === 'OPTIONS'
        ? Object.assign(Buffer.from(''), {
            [Symbol.for('status')]: 204,
          })
        : await next(context)
      )

      response[Symbol.for('headers')] = {
        'Access-Control-Allow-Origin': includesStar ? '*' : context.headers.origin,
        'Access-Control-Allow-Methods': [].concat(methods).join(','),
        'Access-Control-Allow-Headers': [].concat(headers).join(',')
      }

      return response
    }
  }
}

function applyHeaders (headers = {}) {
  return next => {
    return async function xfo (context) {
      const result = await next(context)
      Object.assign(result[Symbol.for('headers')], headers)
      return result
    }
  }
}

const applyXFO = (mode) => applyHeaders({ 'x-frame-options': mode })

// 

// 

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

// 
// 
// 

// 
function handleStatus ({
  git = process.env.GIT_COMMIT,
  reachability = {
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
// 

// 
function handlePing () {
  return next => context => {
    if (context.url.pathname === '/monitor/ping') {
      return ship
    }
    return next(context)
  }
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
  handlers = _requireOr('./handlers'),
  bodyParsers = _requireOr('./body', [urlEncoded, json]),
  after = require('tap').teardown
}) {
  const shot = require('@hapi/shot')
  // 

  // 

  // 

  return inner => async assert => {
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

function _processMiddleware (middleware) {
  return [].concat(Array.isArray(middleware) ? middleware : middleware.APP_MIDDLEWARE)
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

let _cookie = null
class Cookie extends Map {
  constructor(values) {
    super(values)
    this.changed = new Set()
  }

  set (key, value) {
    if (this.changed) {
      this.changed.add(key)
    }

    const defaults = {
      sameSite: true,
      secure: !isDev(),
      httpOnly: true,
    }
    return super.set(key, typeof value === 'string' ? {
      ...defaults,
      value
    } : {
      ...defaults,
      ...value
    })
  }

  delete (key) {
    this.changed.add(key)
    return super.delete(key)
  }

  collect () {
    const cookies = []
    for (const key of this.changed) {
      if (this.has(key)) {
        const { value, ...opts } = this.get(key)
        cookies.push(_cookie.serialize(key, value, opts))
      } else {
        cookies.push(_cookie.serialize(key, 'null', {
          httpOnly: true,
          expires: new Date(),
          maxAge: 0
        }))
      }
    }

    return cookies
  }

  static from (string) {
    _cookie = _cookie || require('cookie')
    return new Cookie(Object.entries(_cookie.parse(string)))
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
// 
// 
  handleCORS,
  applyXFO,
// 
...exports.decorators // forwarding these here.
}

// 
if (require.main === module) {
  main({
    middleware: [
      // 
      // 
      handlePing,
      // 
      log,

      // 
      // 
      ..._processMiddleware(_requireOr('./middleware', [])),
      // 
      ...[handleStatus]
      // 
    ]
  }).then(server => {
    server.listen(Number(process.env.PORT) || 5000, () => {
      bole('server').info(`now listening on port ${server.address().port}`)
    })
  }).catch(err => {
    console.error(err.stack)
    process.exit(1)
  })
}
// 
