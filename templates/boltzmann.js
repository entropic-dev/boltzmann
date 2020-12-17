#!/usr/bin/env node
{% if not selftest %}/* eslint-disable */{% endif %}
{% if not selftest %}/* istanbul ignore file */{% endif %}
'use strict'
// Boltzmann v{{ version }}

// {% if esm %}
import { createRequire } from 'module'
import esMain from 'es-main'
const require = createRequire(import.meta.url)
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
// {% set EXPORTS = "export " %}
// {% else %}
// {% set EXPORTS = "" %}
// {% endif %}

const serviceName = (
  process.env.SERVICE_NAME ||
  require('./package.json').name.split('/').pop()
)

// {% if honeycomb %}
const beeline = require('honeycomb-beeline')({
  writeKey: process.env.HONEYCOMBIO_WRITE_KEY,
  dataset: process.env.HONEYCOMBIO_DATASET,
  sampleRate: Number(process.env.HONEYCOMBIO_SAMPLE_RATE) || Number(process.env.HONEYCOMB_SAMPLE_RATE) || 1,
  serviceName
})
const onHeaders = require('on-headers')
// {% endif %}

const ships = require('culture-ships')
// {% if ping %}
const ship = ships.random()
// {% endif %}
const querystring = require('querystring')
const { promisify } = require('util')
const isDev = require('are-we-dev')
const fmw = require('find-my-way')
const accepts = require('accepts')
const fs = require('fs').promises
const crypto = require('crypto')
// {% if csrf %}
const CsrfTokens = require('csrf')
// {% endif %}
const http = require('http')
const bole = require('bole')
const path = require('path')
const os = require('os')
// {% if redis %}
const redis = require('handy-redis')
// {% endif %}
// {% if postgres %}
const pg = require('pg')
// {% endif %}

const THREW = Symbol.for('threw')
const STATUS = Symbol.for('status')
const REISSUE = Symbol.for('reissue')
const HEADERS = Symbol.for('headers')
const TEMPLATE = Symbol.for('template')
const TRACE_HTTP_HEADER = 'x-honeycomb-trace'

let ajv = null
let ajvLoose = null
let ajvStrict = null

{{ EXPORTS }} async function main ({
  middleware = _requireOr('./middleware', []).then(_processMiddleware),
  bodyParsers = _requireOr('./body', [urlEncoded, json]),
  handlers = _requireOr('./handlers', {}),
} = {}) {
  [middleware, bodyParsers, handlers] = await Promise.all([
    middleware,
    bodyParsers,
    handlers,
  ])

  const server = http.createServer()

  const handler = await buildMiddleware(middleware, await router(handlers))
  Context._bodyParser = bodyParsers.reduceRight((lhs, rhs) => rhs(lhs), request => {
    throw Object.assign(new Error('Cannot parse request body'), {
      [STATUS]: 415
    })
  })

  // {% if templates %}
  let _middleware = []
  if (isDev() && !process.env.TAP) {
    const getFunctionLocation = require('get-function-location')
    _middleware = await Promise.all(middleware.map(async xs => {
      const fn = (Array.isArray(xs) ? xs[0] : xs)
      const loc = await getFunctionLocation(fn)
      return {
        name: fn.name,
        location: `${loc.source.replace('file://', 'vscode://file')}:${loc.line}:${loc.column}`
      }
    }))
  }
  // {% endif %}

  server.on('request', async (req, res) => {
    const context = new Context(req, res)

    // {% if templates %}
    if (isDev()) {
      context._handlers = handlers
      context._middleware = _middleware
    }
    // {% endif %}

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

    headers['x-clacks-overhead'] = 'GNU/Terry Pratchett'

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

{{ EXPORTS }} class Context {
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
    this._loadSession = async () => {
      throw new Error('To use context.session, attach session middleware to your app')
    }

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

  get cookie () {
    this._cookie = this._cookie || Cookie.from(this.headers.cookie || '')
    return this._cookie
  }

  /** @type {Promise<Session>} */
  get session () {
    return this._loadSession()
  }

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

  // {% if honeycomb %}
  get traceURL () {
    const url = new URL(`https://ui.honeycomb.io/${process.env.HONEYCOMBIO_TEAM}/datasets/${process.env.HONEYCOMBIO_DATASET}/trace`)
    url.searchParams.set('trace_id', this._honeycombTrace.payload['trace.trace_id'])
    url.searchParams.set('trace_start_ts', Math.floor(this._honeycombTrace.startTime/1000 - 1))
    return String(url)
  }
  // {% endif %}

  get url() {
    if (this._parsedUrl) {
      return this._parsedUrl
    }
    this._parsedUrl = new URL(this.request.url, `http://${this.headers.host || 'example.com'}`)
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

class NoMatchError extends Error {
  constructor(method, pathname) {
    super(`Could not find route for ${method} ${pathname}`)
    Error.captureStackTrace(this, NoMatchError)
    this[STATUS] = 404
    this.__noMatch = true
  }
}

{{ EXPORTS }} async function routes (handlers = _requireOr('./handlers')) {
  handlers = await handlers

  const routes = []
  for (let [key, handler] of Object.entries(handlers)) {
    if (typeof handler.route === 'string') {
      let [method, ...route] = handler.route.split(' ')
      route = route.join(' ')
      if (route.length === 0) {
        route = method
        method = (handler.method || 'GET')
      }

      const { version, middleware, decorators, ...rest } = handler

      let location = null
      let link = null

      if (isDev()) {
        const getFunctionLocation = require('get-function-location')
        location = await getFunctionLocation(handler)
        link = `${location.source.replace('file://', 'vscode://file')}:${location.line}:${location.column}`
      }

      routes.push({
        key,
        location,
        link,
        method,
        route,
        version,
        middleware,
        handler,
        props: rest
      })
    }
  }

  return routes
}

// {% if esbuild %}
async function _findESBuildEntries (source) {
  const routeMetadata = await routes()

  const entries = new Map()
  for (const route of routeMetadata) {
    if (![].concat(route.props.method).some(xs => xs === 'GET' || xs === 'POST')) {
      continue
    }

    const basename = route.props.entry || route.handler.name || route.key
    const filepath = path.join(source, basename)
    for (const suffix of ['.js', '.jsx', '.ts', '.tsx']) {
      const entrypoint = `${filepath}${suffix}`
      const stats = await fs.stat(entrypoint).catch(_ => null)
      if (stats && stats.isFile()) {
        entries.set(route.handler, `${basename}${suffix}`)
        break
      }
    }
  }

  return entries
}

{{ EXPORTS }} async function buildAssets (
  destination = 'build',
  middleware = _requireOr('./middleware', []).then(_processMiddleware),
  handlers = _requireOr('./handlers', {})
) {
  middleware = await middleware
  let [, config = {}] = [].concat(middleware.find(xs => esbuild === (Array.isArray(xs) ? xs[0] : xs)))

  config = {
    source: 'client',
    prefix: '_assets',
    staticUrl: process.env.STATIC_URL,
    destination,
    options: {},
    ...config,
  }

  // XXX(CD): at the time of writing, router desugars handler properties into their canonical attributes.
  // Eventually the `routes()` function should do this, and the main function should rely on routes().
  await router(await handlers)

  const entries = await _findESBuildEntries(config.source)

  const esbuildConfig = {
    sourcemap: 'external',
    define: {
      'process.env': 'false',
    },
    minify: true,
    format: 'esm',
    splitting: true,
    bundle: true,
    ...config.options,
    entryPoints: [...new Set(entries.values())].map((value) => path.join(config.source, value)),
    outdir: destination,
  }

  if (entries.size > 0) {
    _build = _build || require('esbuild').build
    await _build(esbuildConfig)
  }
}
// {% endif %}

{{ EXPORTS }} async function printRoutes () {
  const metadata = await routes()

  const maxRouteLen = metadata.reduce((acc, { route }) => Math.max(acc, route.length), 0)
  const maxHandlerLen = metadata.reduce((acc, { handler, key }) => Math.max(acc, (handler.name || key).length), 0)
  const maxMethodLen = metadata
    .map(({method}) => [].concat(method))
    .flat()
    .reduce((acc, method) => Math.max(acc, method.length), 0)

  const map = {
    'GET': '\x1b[32;1m',
    'DELETE': '\x1b[31m',
    'POST': '\x1b[33;1m',
    'PATCH': '\x1b[33;1m',
    'PUT': '\x1b[35;1m',
    '*': '\x1b[36;1m'
  }

  const ansi = require('ansi-escapes')
  const supportsHyperlinks = require('supports-hyperlinks')

  for (const meta of metadata) {
    for (let method of [].concat(meta.method)) {
      const originalMethod = method.toUpperCase().trim()
      method = `${(map[originalMethod] || map['*'])}${originalMethod}\x1b[0m`
      method = method + ' '.repeat(Math.max(0, maxMethodLen - originalMethod.length + 1))

      const rlen = meta.route.trim().length
      const route = meta.route.trim().replace(/:([^\/-]+)/g, (a, m) => {
        return `\x1b[4m:${m}\x1b[0m`
      }) + ' '.repeat(Math.max(0, maxRouteLen - rlen) + 1)

      const handler = (meta.handler.name || meta.key).padEnd(maxHandlerLen + 1)

      const source = meta.location.source.replace(`file://${process.cwd()}`, '.')
      let filename = `${source}:${meta.location.line}:${meta.location.column}`
      filename = (
        supportsHyperlinks.stdout
        ? ansi.link(filename, meta.link)
        : filename
      )

      console.log(`  ${method}${route}${handler} \x1b[38;5;8m(\x1b[4m${filename}\x1b[0m\x1b[38;5;8m)\x1b[0m`)
    }
  }

  if (supportsHyperlinks.stdout) {
    console.log()
    console.log('(hold ⌘ and click on any filename above to open in VSCode)')
  }
  console.log()
}

async function router (handlers) {
  const wayfinder = fmw({})

  for (let [key, handler] of Object.entries(handlers)) {
    if (typeof handler.route === 'string') {
      let [method, ...route] = handler.route.split(' ')
      route = route.join(' ')
      if (route.length === 0) {
        route = method
        method = (handler.method || 'GET')
      }
      const opts = {}
      if (handler.version) {
        opts.version = handler.version
      }

      const { version, middleware, decorators, ...rest } = handler

      let location = null
      // {% if templates %}
      if (isDev()) {
        const getFunctionLocation = require('get-function-location')
        const loc = await getFunctionLocation(handler)
        location = `${loc.source.replace('file://', 'vscode://file')}:${loc.line}:${loc.column}`
      }
      // {% endif %}

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
        location,
        middleware: (middleware || []).map(xs => Array.isArray(xs) ? xs[0].name : xs.name),
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
      throw new NoMatchError(context.request.method, pathname)
    }

    const {
      method,
      route,
      decorators,
      middleware,
      version
    } = match.handler

    context._routed = {
      handler: match.handler,
      method,
      route,
      decorators,
      middleware,
      version,
      location: match.handler.location,
      name: match.handler.name,
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
    const logger = bole('boltzmann:server')
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
          // {% if templates %}
          if (body && body[TEMPLATE]) {
            headers['content-type'] = 'text/html; charset=utf-8'
          } else {
            headers['content-type'] = 'application/json; charset=utf-8'
          }
          // {% else %}
          headers['content-type'] = 'application/json; charset=utf-8'
          // {% endif %}
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

// {% if templates %}
function template ({
  paths = ['templates'],
  filters = {},
  tags = {},
  logger = bole('boltzmann:templates'),
  opts = {
    noCache: isDev()
  }
} = {}) {
  const nunjucks = require('nunjucks')
  paths = [].concat(paths)
  try {
    const assert = require('assert')
    paths.forEach(xs => assert(typeof xs == 'string'))
  } catch (_c) {
    throw new TypeError('The `paths` option for template() must be an array of path strings')
  }

  paths = paths.slice().map(
    xs => path.join(__dirname, xs)
  )
  const env = new nunjucks.Environment(
    new nunjucks.FileSystemLoader(paths, {}),
    opts
  )

  for (const name in filters) {
    env.addFilter(name, (...args) => {
      const cb = args[args.length - 1]
      new Promise((resolve, _) => {
        resolve(filters[name](...args.slice(0, -1)))
      }).then(
        xs => cb(null, xs),
        xs => cb(xs, null)
      )
    }, true)
  }

  for (const name in tags) {
    env.addExtension(name, tags[name])
  }

  // {% raw %}
  const devErrorTemplate = new nunjucks.Template(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>{% if response.stack %}{{ response.name }}: {{ response.message }}{% elif renderError %}{{ renderError.name }}: {{ renderError.message }}{% else %}Error{% endif%}</title>
      <link rel="stylesheet" href="https://unpkg.com/tachyons@4.12.0/css/tachyons.min.css"/>
      <style>
        #stacktrace .copy-and-paste { display: none; }
        #stacktrace.paste .copy-and-paste { display: block; }
        #stacktrace.paste .rich { display: none; }
        .frame { cursor: pointer; }
        .frame .framecontext { display: none; }
        .frame.more .framecontext { display: table-row; }
        .lineno { user-select: none; width: 1%; min-width: 50px; text-align: right; }
        .framecontext { user-select: none; }
        .frameline { user-select: none; }
        .noselect { user-select: none; }
      </style>
    </head>

    <body class="sans-serif w-100">
      <header class="bg-{% if status >= 500 or not status %}light-red{% else %}purple{% endif %}">
        <div class="mw7 center">
          <h1 class="f1-ns f4 mt0 mb2 white-90">
            {% if response.stack %}
              {% if status %}<code class="f3-ns bg-white normal br3 pv1 ph2 v-mid {% if status >= 500 %}red{% elif status >= 400 %}purple{% endif %}">{{ status }}</code> {% endif %}{{ response.name }} at {{ context.url.pathname }}
            {% elif renderError %}
              {{ renderError.name }} at {{ context.url.pathname }}
            {% else %}
              Unknown error at {{ context.url.pathname }}
            {% endif %}
          </h1>
          <h2 class="f2-ns f5 mt0 mb2 white-80">
            {% if response.stack %}
              {{ response.message }}
            {% elif renderError %}
              {{ renderError.message }}
            {% endif %}
          </h2>

          <table class="f6 white">
            <tr>
              <td class="tr white-80 v-top pr2">Request Method</td>
              <td><code>{{ context.method }}</code></td>
            </tr>
            <tr>
              <td class="tr white-80 v-top pr2">Request URL</td>
              <td><code>{{ context.url }}</code></td>
            </tr>
            {% if context._routed.route %}
            <tr>
              <td class="tr white-80 v-top pr2">Handler</td>
              <td><a class="link underline washed-blue dim" href="{{ context._routed.location }}"><code>{{ context._routed.name }}</code></a>, mounted at <code>{{ context._routed.method }} {{ context._routed.route }}</code></td>
            </tr>
            {% endif %}
            <tr>
              <td class="tr white-80 v-top pr2">Honeycomb Trace</td>
              <td>
                {% if context._honeycombTrace %}
                  <a class="link underline washed-blue dim" target="_blank" rel="noreferrer noopener" href="{{ context.traceURL }}">
                    Available
                  </a>
                {% else %}
                  <details>
                    <summary>Not available.</summary>
                    Make sure the <code>HONEYCOMBIO_DATASET</code>, <code>HONEYCOMBIO_WRITE_KEY</code>, and
                    <code>HONEYCOMBIO_TEAM</code> environment variables are set, then restart boltzmann.
                  </details>
                {% endif %}
              </td>
            </tr>
            <tr>
              <td class="tr white-80 v-top pr2">Handler Version</td>
              <td><code>{{ context._routed.version|default("*") }}</code></td>
            </tr>
            <tr>
              <td class="tr white-80 v-top pr2">Application Middleware</td>
              <td>
                <ol class="mv0 ph0" style="list-style-position:inside">
                  {% for middleware in context._middleware %}
                    <li><a class="link underline washed-blue dim" target="_blank" rel="noopener noreferrer" href="{{ middleware.location }}"><code>{{ middleware.name }}</code></a></li>
                  {% else %}
                    <li class="list">No application middleware installed.</li>
                  {% endfor %}
                </ol>
              </td>
            </tr>
            <tr>
              <td class="tr white-80 v-top pr2">Handler Middleware</td>
              <td>
                {% if context._routed.middleware %}
                <ol class="mv0 ph0" style="list-style-position:inside">
                  {% for middleware in context._routed.middleware %}
                    <li><code>{{ middleware }}</code></li>
                  {% else %}
                    <li class="list">No handler-specific middleware installed.</li>
                  {% endfor %}
                </ol>
                {% endif %}
              </td>
            </tr>
            <tr>
              <td class="tr white-80 v-top pr2">Template paths</td>
              <td>
                <ol class="mv0 ph0" style="list-style-position:inside">
                  {% for path in template_paths %}
                    <li><code>{{ path }}</code></li>
                  {% endfor %}
                </ol>
              </td>
            </tr>
            <tr>
              <td class="tr white-80 v-top pr2">Boltzmann Version</td>
              <td>${require('./package.json').boltzmann.version}</td>
            </tr>
            <tr>
              <td class="tr white-80 v-top pr2">Node Version</td>
              <td>${process.versions.node}</td>
            </tr>
          </table>

          <aside class="pv3-l i f6 white-60 lh-copy">
            You&#39;re seeing this page because you are in dev mode.
            {% if context.method == "GET" %}
            <a class="link underline washed-blue dim" href="?__production=1">Click here</a> to see the production version of this error, or
            {% endif %}
            set the <code>NODE_ENV</code> environment variable to <code>production</code> and restart the server.
          </aside>
        </div>
      </header>

      {% if response.__noMatch %}
      <section id="routes" class="bg-light-gray black-90">
        <div class="mw7 center pb3-l">
          <aside class="pv3-l i f6 black-60 lh-copy">The following routes are available:</aside>
          <table class="collapse w-100 frame">
          {% for name, handler in context._handlers %}
            <tr>
              <td>
                {% if handler.method.constructor.name == "Array" %}
                  {% for method in handler.method %}
                    <code>{{ method }}</code>{% if not loop.last %}, {% endif %}
                  {% endfor %}
                {% else %}
                    <code>{{ handler.method }}</code>
                {% endif %}
              </td>
              <td>
                <code>{{ handler.route }}</code>
              </td>
              <td>
                <code>{{ handler.name }}</code>
              </td>
            </tr>
            {% if handler.route == context.url.pathname %}
            <tr>
              <td><aside class="i f6 lh-copy black-40">↪︎</aside></td>
              <td colspan="2">
                <aside class="i f6 lh-copy black-40">
                  Are you trying to access this route, which is available at a different method or version?
                </aside>
              </td>
            </tr>
            {% endif %}
          {% endfor %}
          </table>
        </div>
      </section>
      {% endif %}

      <section id="stacktrace" class="bg-washed-{% if status >= 500 or not status %}yellow{% else %}blue{% endif %} black-90">
        <div class="mw7 center">
          {% if response.stack %}
            <div class="rich">
              <h3 class="f3-ns f5 mt0 pt2">
                Stack trace from error
                <button class="input-reset bn pointer" onclick="javascript:window.stacktrace.classList.toggle('paste');">Switch to copy-and-paste view</button>
              </h3>
              {% if frames %}
                {% for frame in frames %}

                  <p>
                    <a href="vscode://file/{{ frame.getFileName() }}:{{ frame.getLineNumber() }}:{{ frame.getColumnNumber() }}" target="_blank"><code>{{ frame.getRelativeFileName() }}</code></a>, line {{ frame.getLineNumber() }}, at <code>{{ frame.getFunctionNameSanitized() }}</code>
                  </p>

                  {% if frame.context %}
                  <table class="collapse w-100 frame" onclick="javascript:this.closest('table').classList.toggle('more')">
                    {% for line in frame.context.pre %}
                    <tr class="framecontext black-40 bg-black-10">
                      <td class="lineno pr2 tr f7 black-20">
                        <pre class="ma0"><code>{{ frame.getLineNumber() - loop.revindex }}</code></pre>
                      </td>
                      <td>
                        <pre class="ma0"><code>{{ line }}</code></pre>
                      </td>
                    </tr>
                    {% endfor %}
                    <tr class="frameline black-90 bg-black-10">
                      <td class="lineno pr2 tr f7 black-20">
                        <pre class="ma0"><code>{{ frame.getLineNumber() }}</code></pre>
                      </td>
                      <td>
                        <pre class="ma0"><code>{{ frame.context.line }}</code></pre>
                      </td>
                    </tr>
                    <tr class="frameline black-90 bg-black-10">
                      <td class="lineno pr2 tr f7 black-20">
                        <pre class="ma0"><code></code></pre>
                      </td>
                      <td>
                        <pre class="ma0"><code class="red">{{ "^"|indent(frame.getColumnNumber() - 1, true)|replace(" ", "-") }}</code></pre>
                      </td>
                    </tr>
                    {% for line in frame.context.post %}
                    <tr class="framecontext black-40 bg-black-10">
                      <td class="lineno pr2 tr f7 black-20">
                        <pre class="ma0"><code>{{ frame.getLineNumber() + loop.index }}</code></pre>
                      </td>
                      <td>
                        <pre class="ma0"><code>{{ line }}</code></pre>
                      </td>
                    </tr>
                    {% endfor %}
                  </table>
                  {% else %}
                  {% endif %}

                {% endfor %}
              {% else %}
                <h1><code>{{ response.name }}</code>: <code>{{ response.message }}</code></h1>
                <pre><code>{{ response.stack }}</code></pre>
                <aside class="pv3-l i f6 white-60 lh-copy">
                  The <code>.stack</code> property was accessed by other code before the template middleware received it. As a result, we cannot display a rich stack trace.
                </aside>
              {% endif %}
            {% endif %}

            {% if renderError %}
              <h3 class="f3-ns f5 mt0 pt2">
                Caught error rendering <code>{{ template }}</code>
              </h3>
              {% if "template not found" in renderError.message %}
                <aside class="pv3-l i f6 black-60 lh-copy">
                  Caught <code>{{ renderError.message }}</code>.
                  Tried the following paths:
                </aside>
                <ol class="mv0 ph0" style="list-style-position:inside">
                  {% for path in template_paths %}
                    <li><code>{{ path }}/{{ template }}</code></li>
                  {% endfor %}
                </ol>
              {% else %}
                <pre><code>{{ renderError.stack }}</code></pre>
              {% endif %}
              <br/>
            {% endif %}
          </div>

          <div class="copy-and-paste">
              <h3 class="f3-ns f5 mt0 pt2">
                Stack trace from error
                <button class="input-reset bn pointer" onclick="javascript:window.stacktrace.classList.toggle('paste');">Switch back to interactive view</button>
              </h3>
              <textarea class="w-100 h5-l">{{ response.stack }}{% if response.stack %}
  {% endif %}{{ renderError.stack }}</textarea>
          </div>
        </div>
      </section>

      <section id="data" class="bg-light-gray black-90">
        <div class="mw7 center">
          <h3 class="f3-ns f5 mt0 pt2">Request Information</h3>
          {% if context.params %}
          <div class="flex flex-wrap">
            <h4 class="noselect mt0 tr w-10 mr2">URL Params</h4>
            <table class="collapse w-80 v-top">
              {% for name, value in context.params %}
              <tr>
                <td class="pb2 w-20 v-top tr pr4"><code class="black-60 i">{{ name }}</code></td>
                <td class="pb2 v-top"><code>{{ value }}</code></td>
              </tr>
              {% endfor %}
            </table>
          </div>
          {% endif %}

          <div class="flex flex-wrap">
            <h4 class="noselect mt0 tr w-10 mr2">URL Query String</h4>
            <table class="collapse w-80 v-top">
              {% for name, value in context.query %}
              <tr class="striped--light-gray">
                <td class="pb2 w-20 v-top tr pr4"><code class="black-60 i">{{ name }}</code></td>
                <td class="pb2 v-top"><code>{{ value }}</code></td>
              </tr>
              {% endfor %}
            </table>
          </div>

          <div class="flex flex-wrap">
            <h4 class="noselect mt0 tr w-10 mr2">Request Headers</h4>
            <table class="collapse w-80">
              {% for name, value in context.headers %}
              <tr class="striped--light-gray">
                <td class="pb2 w-20 v-top tr pr4"><code class="black-60 i">{{ name }}:</code></td>
                <td class="pb2 v-top"><code>{{ value }}</code></td>
              </tr>
              {% endfor %}
            </table>
          </div>

          <hr />

          <h3 class="f3-ns f5 mt0 pt2">Response Information</h3>
          <aside class="pb3-l i f6 black-60 lh-copy">Response was{% if not threw %} not{% endif %} thrown.</aside>
          <div class="flex flex-wrap">
            <h4 class="noselect mt0 tr w-10 mr2">Status</h4>
            <pre class="mt0"><a href="https://httpstatus.es/{{ status }}"><code>{{ status }}</code></a></pre>
          </div>

          {% if template %}
          <div class="flex flex-wrap">
            <h4 class="noselect mt0 tr w-10 mr2">Template</h4>
            <pre class="mt0"><code>{{ template }}</code></pre>
          </div>
          {% endif %}

          <div class="flex flex-wrap">
            <h4 class="noselect mt0 tr w-10 mr2">Response Data</h4>
            <pre class="mt0"><code>{{ response|dump(2) }}</code></pre>
          </div>

          <div class="flex flex-wrap">
            <h4 class="noselect mt0 tr w-10 mr2">Response Headers</h4>
            <pre class="mt0"><code>{{ headers|dump(2) }}</code></pre>
          </div>
        </div>
      </section>


    </body>
    </html>
  `, env)
  // {% endraw %}

  // development behavior: if we encounter an error rendering a template, we
  // display a development error template explaining the error. If the error
  // was received while handling an original error, that will be displayed as
  // well. TODO: each stack frame should be displayed in context.
  //
  // production behavior: we try to render a 5xx.html template. If that's not
  // available, return a "raw" error display -- "An error occurred" with a
  // correlation ID.
  return next => {
    return async function template (context) {
      const response = await next(context)
      let {
        [STATUS]: status,
        [HEADERS]: headers,
        [TEMPLATE]: template,
        [THREW]: threw
      } = response

      if (!template && !threw) {
        return response
      }

      let ctxt = response
      let name = template
      let renderingErrorTemplate = false
      if (threw && !template) {
        // If you threw and didn't have a template set, we have to guess at
        // whether this response is meant for consumption by a browser or
        // some other client.
        const maybeJSON = (
          context.headers['sec-fetch-dest'] === 'none' || // fetch()
          'x-requested-with' in context.headers ||
          (context.headers['content-type'] || '').includes('application/json')
        )

        if (maybeJSON) {
          return response
        }

        headers['content-type'] = 'text/html'
        const useDebug = isDev() && !('__production' in context.query)
        name = (
          useDebug
          ? devErrorTemplate
          : `${String(status - (status % 100)).replace(/0/g, 'x')}.html`
        )

        renderingErrorTemplate = true

        let frames = null
        if (useDebug) {
          const stackman = require('stackman')()
          frames = await new Promise((resolve, reject) => {
            stackman.callsites(response, (err, frames) => err ? resolve([]) : resolve(frames))
          })

          const contexts = await new Promise((resolve, reject) => {
            stackman.sourceContexts(frames, (err, contexts) => err ? resolve([]) : resolve(contexts))
          })

          frames.forEach((frame, idx) => frame.context = contexts[idx])
        }

        ctxt = {
          context,
          response,
          frames,
          template,
          template_paths: paths,
          renderError: null,
          headers,
          threw,
          status
        }
      }

      let rendered = null
      try {
        rendered = await new Promise((resolve, reject) => {
          env.render(name, ctxt, (err, result) => {
            err ? reject(err) : resolve(result)
          })
        })
      } catch (err) {
        status = err[STATUS] || 500
        const target = !renderingErrorTemplate && isDev() ? devErrorTemplate : '5xx.html'

        rendered = await new Promise((resolve, _) => {
          env.render(target, {
            context,
            response,
            template: name,
            template_paths: paths,
            renderError: err,
            headers,
            status
          }, (err, result) => {
            if (err) {
              const correlation = require('uuid').v4()
              if (response.stack) {
                logger.error(`[${correlation} 1/2] Caught error rendering 5xx.html for original error: ${response.stack}`)
              }
              logger.error(`[${correlation} ${response.stack ? '2/2' : '1/1'}] Caught template error while rendering 5xx.html: ${err.stack}`)

              resolve(`
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <meta charset="UTF-8">
                <title></title>
              </head>
              <body>
                <h1>An unexpected server error occurred (ref: <code>${correlation}</code>).</h1>
              </body>
              </html>`)
            } else {
              resolve(result)
            }
          })
        })
      }

      // NB: This removes "THREW" because the template layer is handling the error.
      return Object.assign(Buffer.from(rendered, 'utf8'), {
        [STATUS]: status,
        [HEADERS]: headers,
      })
    }
  }
}
// {% endif %}

function templateContext(extraContext = {}) {
  return next => {
    return async context => {
      const result = await next(context)

      if (Symbol.for('template') in result) {
        result.STATIC_URL = process.env.STATIC_URL || '/static'

        for (const [key, fn] of Object.entries(extraContext)) {
          result[key] = typeof fn === 'function' ? await fn(context) : fn
        }
      }

      return result
    }
  }
}

// {% if staticfiles or esbuild %}
let mime = null

function staticfiles({ prefix = 'static', dir = 'static', addToContext = true, fs = require('fs'), quiet = false} = {}) {
  const logger = bole('boltzmann:staticfiles')
  if (!isDev()) {
    return (
      addToContext
      ? templateContext({ STATIC_URL: process.env.STATIC_URL })
      : next => context => next(context)
    )
  }

  mime = mime || require('mime')
  dir = path.isAbsolute(dir) ? dir : path.join(__dirname, dir)

  return next => {
    if (!quiet) {
      logger.info(`Running in development mode; assets served from /${prefix}`)
    }

    const prefixURL = `/${prefix}/`
    const contextMiddleware = (
      addToContext
      ? templateContext({ STATIC_URL: prefixURL })
      : next => context => next(context)
    )

    return contextMiddleware(async context => {
      if (!context.url.pathname.startsWith(prefixURL)) {
        return next(context)
      }

      const target = path.join(dir, context.url.pathname.slice(1 + prefix.length))
      if (!target.startsWith(dir + path.sep)) {
        throw Object.assign(new Error('File not found'), {
          [Symbol.for('status')]: 404
        })
      }

      const data = await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(target)
          .on('open', () => resolve(stream))
          .on('error', reject)
      })
      const mimetype = mime.getType(path.extname(target))
      return Object.assign(data, {
        [Symbol.for('headers')]: {
          'content-type': mimetype || 'application/octet-stream'
        }
      })
    })
  }
}
// {% endif %}

// {% if esbuild %}
let _build = null
function esbuild({
  source = 'client',
  prefix = '_assets',
  staticUrl = process.env.STATIC_URL,
  destination = path.join(os.tmpdir(), crypto.createHash('sha1').update(__dirname).digest('hex')),
  options = {}
} = {}) {
  const logger = bole('boltzmann:esbuild')
  if (!isDev()) {
    return next => staticAssets(async function inner(context) {
      const response = await next(context)
      if (!response[Symbol.for('template')]) {
        return response
      }

      const entry = entries.get(context._routed.handler)
      if (!entry) {
        return response
      }

      response.ESBUILD_ENTRY_URL = `/${prefix}/${entry.replace(/\\/g, '/')}`
      return response
    })
  }

  const staticAssets = staticfiles({
    prefix,
    dir: destination,
    addToContext: false,
    quiet: true
  })

  return async (next) => {
    await fs.mkdir(destination, { recursive: true })

    const routeMetadata = await routes()

    const entries = await _findESBuildEntries(source)

    const start = Date.now()
    if (entries.size > 0) {
      _build = _build || require('esbuild').build
      await _build({
        sourcemap: 'inline',
        define: {
          'process.env': 'false',
        },
        minify: true,
        format: 'esm',
        splitting: true,
        bundle: true,
        ...options,
        entryPoints: [...new Set(entries.values())].map((value) => path.join(source, value)),
        outdir: destination,
      })
    }
    logger.info(`esbuild development middleware active; built in ${Date.now() - start}ms`)

    return staticAssets(async function inner(context) {
      const response = await next(context)
      if (!response[Symbol.for('template')]) {
        return response
      }

      const entry = entries.get(context._routed.handler)
      if (!entry) {
        return response
      }

      response.ESBUILD_ENTRY_URL = `/${prefix}/${entry.replace(/\\/g, '/')}`
      return response
    })
  }
}
// {% endif %}

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

const applyXFO = (mode) => {
  if (!['DENY', 'SAMEORIGIN'].includes(mode)) {
    throw new Error('applyXFO(): Allowed x-frame-options directives are DENY and SAMEORIGIN.')
  }
  return applyHeaders({ 'x-frame-options': mode })
}

// {% if csrf %}
// csrf protection middleware
function signCookie(value, secret) {
  return `${value}.${crypto.createHmac('sha256', secret).update(value).digest('base64')}`
}

function checkCookieSignature(input, secret) {
  if (!input) {
    return false
  }
  const [ message, signature ] = input.split('.', 2)
  const valid = signCookie(message, secret)
  if (valid.length !== input.length) {
    return false
  }
  return crypto.timingSafeEqual(Buffer.from(input), Buffer.from(valid)) ? message : false
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function applyCSRF ({
  cookieSecret = process.env.COOKIE_SECRET,
  csrfCookie = '_csrf',
  param = '_csrf',
  header = 'csrf-token'
} = {}) {

  if (!cookieSecret) {
    throw new Error('You cannot use CSRF middleware without providing a secret for signing cookies')
  }

  return next => {
    const tokens = new CsrfTokens()
    return async function csrf (context) {

      function generateNewSecretCookie () {
        const newSecret = tokens.secretSync()
        const signed = signCookie(newSecret, cookieSecret)
        context.cookie.set(csrfCookie, signed)
        return newSecret
      }

      function fetchSecretFromCookie () {
        const candidate = context.cookie.get(csrfCookie)
        if (!candidate) {
          return undefined
        }
        return checkCookieSignature(candidate.value, cookieSecret)
      }

      // Handlers can call this to get a token to use on relevant requests.
      // It creates a token-generating secret for the user if they don't have one
      // already, and makes a new token.
      function csrfToken ({refresh = false} = {}) {
        const freshSecret = fetchSecretFromCookie()

        // We might be coming through here more than once.
        // Re-use the token if we can, but generate a new one if the secret in the cookie changed.
        if (!refresh && token && (freshSecret === secret) ) {
          return token
        }

        if (!freshSecret) {
          secret = generateNewSecretCookie() // changes value in the closure
        }

        token = tokens.create(secret) // changes value in the closure
        return token
      }

      // set up context for handler, with intentional hoist
      context.csrfToken = csrfToken
      var secret = fetchSecretFromCookie()
      var token

      if (!secret) {
        secret = generateNewSecretCookie()
      }

      if (READ_METHODS.has(context.method)) {
        return next(context)
      }

      const body = await context.body
      const tk = (body && body[param]) || context.headers[header]

      if (!tokens.verify(secret, tk)) {
        throw Object.assign(new Error('Invalid CSRF token'), {
          [Symbol.for('status')]: 403
        })
      }

      return next(context)
    }
  }
}
// {% endif %}

// {% if livereload %}
function livereload({ reloadPath = '/__livereload' } = {}) {
  const logger = bole('boltzmann:livereload')
  logger.info('live reload enabled!')
  const number = Date.now()
  return next => async context => {
    if (context.url.pathname === reloadPath) {
      const { Readable } = require('stream')

      let active = false
      const stream = new Readable({
        read (_) {
          active = true
        }
      })

      const interval = setInterval(() => {
        if (active) {
          active = stream.push(`event: message\ndata: ${number}\n\n`)
        }
      }, 5000)

      stream
        .on('pause', () => active = false)
        .once('error', () => clearInterval(interval))
        .once('end', () => clearInterval(interval))

      return Object.assign(stream, {
        [Symbol.for('headers')]: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
        }
      })
    }

    const response = await next(context)

    if (response[Symbol.for('headers')]['content-type'].startsWith('text/html')) {
      const src = `
        let last = null
        let retryCount = 0
        let retryBackoff = [500, 500, 1000, 1000, 5000, 5000, 10000, 30000, 0]
        function connect() {
          const url = ${JSON.stringify(reloadPath)}
          console.log('connecting to', url)
          const es = new EventSource(url)

          es.onerror = () => {
            es.onmessage = () => {}
            es.onerror = () => {}
            ++retryCount
            if (retryBackoff[retryCount]) {
              es.close()
              setTimeout(connect, retryBackoff[retryCount])
            } else {
              es.close()
              console.log(\`live reload inactive after \${retryBackoff.length} attempts\`)
            }
          }

          es.onmessage = ev => {
            retryCount = 0
            if (last && last !== ev.data) {
              es.onmessage = () => {}
              es.onerror = () => {}
              setTimeout(() => window.location.reload(), 100)
            }
            last = ev.data
          }
        }

        connect()
      `

      return Object.assign(Buffer.from(
        String(response).replace('</html>', `<script>${src}</script></html>`),
        'utf8'
      ), {
        [Symbol.for('status')]: response[Symbol.for('status')],
        [Symbol.for('headers')]: response[Symbol.for('headers')],
      })
    }

    return response
  }
}
// {% endif %}

// {% if oauth %}
let OAuth2 = null

function handleOAuthLogin ({
  prompt,
  max_age,
  audience,
  connection,
  login_hint,
  connection_scope,
  loginRoute = '/login',
  domain = process.env.OAUTH_DOMAIN,
  clientId = process.env.OAUTH_CLIENT_ID,
  authorizationUrl = process.env.OAUTH_AUTHORIZATION_URL,
  callbackUrl = process.env.OAUTH_CALLBACK_URL,
  defaultNextPath = '/'
} = {}) {
  if (!domain) {
    throw new Error(
      `You must provide a domain field to the handleOAuthLogin() middleware config
or set the env var OAUTH_DOMAIN to use OAuth
https://www.boltzmann.dev/en/docs/{{ version }}/reference/middleware/#oauth
`.trim().split('\n').join(' '))
  }

  if (!clientId) {
    throw new Error(
      `You must provide a clientID field to the handleOAuthLogin() middleware config
or set the env var OAUTH_CLIENT_ID to use OAuth
https://www.boltzmann.dev/en/docs/{{ version }}/reference/middleware/#oauth
`.trim().split('\n').join(' '))
  }

  authorizationUrl = authorizationUrl || `https://${domain}/authorize`

  const extraOpts = {}

  if (connection) {
    extraOpts.connection = connection
  }

  if (connection_scope) {
    extraOpts.connection_scope = connection_scope
  }

  if (audience) {
    extraOpts.audience = audience
  }

  if (prompt) {
    extraOpts.prompt = prompt
  }

  if (login_hint) {
    extraOpts.login_hint = login_hint
  }

  if (max_age) {
    extraOpts.max_age = max_age
  }

  return next => async context => {
    callbackUrl = callbackUrl || `http://${context.headers.host.split("/")[0] || 'localhost'}/callback`

    if (context.url.pathname !== loginRoute || context.method !== 'GET') {
      return next(context)
    }

    const nextUrl =  (
      context.query.next && /^\/(?!\/+)/.test(context.query.next) // must start with "/" and NOT contain "//"
      ? context.query.next
      : defaultNextPath
    )

    const nonce = crypto.randomBytes(16).toString('hex')
    const session = await context.session
    session.set('nonce', nonce)
    session.set('next', nextUrl)

    const authorizationParams = {
      ...extraOpts,

      // controlled by mechanism
      nonce,
      response_type: 'code', // this is the type of oauth flow – "code" means web browser flow
      redirect_uri: callbackUrl,
      client_id: clientId
    }

    const location = new URL(authorizationUrl)
    for (const [key, value] of Object.entries(authorizationParams)) {
      location.searchParams.set(key, value)
    }

    return Object.assign(Buffer.from(''), {
      [Symbol.for('status')]: 302,
      [Symbol.for('headers')]: {
        'Location': String(location)
      }
    })
  }
}

function handleOAuthCallback ({
  userKey = 'user',
  domain = process.env.OAUTH_DOMAIN,
  secret = process.env.OAUTH_CLIENT_SECRET,
  clientId = process.env.OAUTH_CLIENT_ID,
  callbackUrl = process.env.OAUTH_CALLBACK_URL,
  tokenUrl = process.env.OAUTH_TOKEN_URL,
  userinfoUrl = process.env.OAUTH_USERINFO_URL,
  authorizationUrl = process.env.OAUTH_AUTHORIZATION_URL,
  expiryLeewaySeconds = process.env.OAUTH_EXPIRY_LEEWAY,
  defaultNextPath = '/'
} = {}) {
  if (!domain) {
    throw new Error(
      `You must provide a domain field to the handleOAuthCallback() config
or set the env var OAUTH_DOMAIN to use OAuth
https://www.boltzmann.dev/en/docs/{{ version }}/reference/middleware/#oauth
`.trim().split('\n').join(' '))
  }

  if (!clientId) {
    throw new Error(
      `You must provide a clientID field to the handleOAuthCallback() config
or set the env var OAUTH_CLIENT_ID to use OAuth
https://www.boltzmann.dev/en/docs/{{ version }}/reference/middleware/#oauth
`.trim().split('\n').join(' '))
  }

  if (!secret) {
    throw new Error(
      `You must provide a secret field to the handleOAuthCallback() config
or set the env var OAUTH_CLIENT_SECRET to use OAuth
https://www.boltzmann.dev/en/docs/{{ version }}/reference/middleware/#oauth
`.trim().split('\n').join(' '))
  }

  authorizationUrl = authorizationUrl || `https://${domain}/authorize`
  userinfoUrl = userinfoUrl || `https://${domain}/userinfo`
  tokenUrl = tokenUrl || `https://${domain}/oauth/token`
  OAuth2 = OAuth2 || require('oauth').OAuth2
  const oauth = new OAuth2(
    clientId,
    secret,
    '',
    authorizationUrl,
    tokenUrl,
    {}
  )

  let loginRoute = null
  return next => async context => {
    callbackUrl = callbackUrl || `http://${context.headers.host.split("/")[0] || 'localhost'}/callback`
    loginRoute = loginRoute || new URL(callbackUrl).pathname
    if (context.url.pathname !== loginRoute || context.method !== 'GET') {
      return next(context)
    }

    if (!context.query.code) {
      throw new Error('Code is required.')
    }

    const session = await context.session
    const expectedNonce = session.get('nonce')

    // XXX: this throws non-error-like objects with statusCodes; we may wish to forward 403 results out
    const { accessToken, refreshToken, params } = await new Promise((resolve, reject) => {
      const params = {
        'grant_type': 'authorization_code',
        'redirect_uri': callbackUrl
      }
      oauth.getOAuthAccessToken(context.query.code, params, (err, accessToken, refreshToken, params) => {
        err ? reject(err) : resolve({ accessToken, refreshToken, params })
      })
    })

    // NB: we are not checking the signature here; we're relying on the nonce
    // to protect us.
    _jwt = _jwt || require('jsonwebtoken')
    _uuid = _uuid || require('uuid')
    try {
      var decoded = _jwt.decode(params.id_token)
    } catch(err) {
      const correlation = _uuid.v4()
      logger.error(`err=${correlation}: failed to decode JWT (jwt="${params.id_token}")`)
      throw Object.assign(new Error(`Encountered error id=${correlation}`), {
        [Symbol.for('status')]: 400
      })
    }

    if (decoded.iss !== `https://${domain}/`) {
      const correlation = _uuid.v4()
      logger.error(`err=${correlation}: Issuer mismatched. Got "${decoded.iss}", expected "https://${process.env.OAUTH_DOMAIN}/"`)
      throw Object.assign(new Error(`Encountered error id=${correlation}`), {
        [Symbol.for('status')]: 403
      })
    }

    if (![].concat(decoded.aud).includes(clientId)) {
      const correlation = _uuid.v4()
      logger.error(`err=${correlation}: Audience mismatched. Got "${decoded.aud}", expected value of "clientId" (default: process.env.OAUTH_CLIENT_ID)`)
      throw Object.assign(new Error(`Encountered error id=${correlation}`), {
        [Symbol.for('status')]: 403
      })
    }

    if (decoded.nonce !== expectedNonce) {
      const correlation = _uuid.v4()
      logger.error(`err=${correlation}: Nonce mismatched. Got "${decoded.nonce}", expected "${expectedNonce}"`)
      throw Object.assign(new Error(`Encountered error id=${correlation}`), {
        [Symbol.for('status')]: 403
      })
    }

    const now = Math.floor(Date.now() / 1000)
    const window = (Number(expiryLeewaySeconds) || 60)
    const expires = (Number(decoded.exp) || 0) + window

    if (expires < now) {
      const correlation = _uuid.v4()
      logger.error(`err=${correlation}: Expiration time exceeded. Got "${decoded.exp}", expected "${now}" (leeway=${window})`)
      throw Object.assign(new Error(`Encountered error id=${correlation}`), {
        [Symbol.for('status')]: 403
      })
    }

    const profile = await new Promise((resolve, reject) => {
      oauth.get(userinfoUrl, accessToken, (err, body) => {
        err ? reject(err) : resolve(JSON.parse(body))
      })
    })

    const nextUrl = session.get('next') || defaultNextPath
    session.delete('nonce')
    session.delete('next')
    context.accessToken = accessToken
    context.refreshToken = refreshToken
    context.profile = profile
    context.nextUrl = nextUrl
    context.userKey = userKey
    return next(context)
  }
}

function handleOAuthLogout ({
  logoutRoute = '/logout',
  clientId = process.env.OAUTH_CLIENT_ID,
  domain = process.env.OAUTH_DOMAIN,
  returnTo = process.env.OAUTH_LOGOUT_CALLBACK,
  logoutUrl = process.env.OAUTH_LOGOUT_URL,
  userKey = 'user',
} = {}) {
  if (!domain) {
    throw new Error(
      `You must provide a domain to the handleOAuthLogout() middleware
or set the env var OAUTH_DOMAIN to use OAuth
https://www.boltzmann.dev/en/docs/{{ version }}/reference/middleware/#oauth
`.trim().split('\n').join(' '))
  }

  if (!clientId) {
    throw new Error(
      `You must provide a clientID to the handleOAuthLogout() middleware
or set the env var OAUTH_CLIENT_ID to use OAuth
https://www.boltzmann.dev/en/docs/{{ version }}/reference/middleware/#oauth
`.trim().split('\n').join(' '))
  }

  logoutUrl = logoutUrl || `https://${domain}/v2/logout`
  return next => async context => {
    if (context.url.pathname !== logoutRoute || context.method !== 'POST') {
      return next(context)
    }

    const session = await context.session
    session.delete(userKey)
    session.reissue()

    returnTo = (
      returnTo ||
      `http://${context.host}${![80, 443].includes(context.request.connection.localPort) ? ':' + context.request.connection.localPort : ''}/`
    )

    const logout = new URL(logoutUrl)
    logout.searchParams.set('returnTo', returnTo)
    logout.searchParams.set('client_id', clientId)

    return Object.assign(Buffer.from(''), {
      [Symbol.for('status')]: 302,
      [Symbol.for('headers')]: {
        'Location': String(logout)
      }
    })
  }
}

function oauth (options = {}) {
  const callback = handleOAuthCallback(options)
  const logout = handleOAuthLogout(options)
  const login = handleOAuthLogin(options)

  return next => callback(logout(login(next)))
}
// {% endif %}

// {% if jwt %}
let _jwt = null
function authenticateJWT ({
  scheme = 'Bearer',
  publicKey = process.env.AUTHENTICATION_KEY,
  algorithms=['RS256'],
  storeAs = 'user'
} = {}) {
  algorithms = [].concat(algorithms)
  try {
    const assert = require('assert')
    algorithms.forEach(xs => assert(typeof xs == 'string'))
  } catch (_c) {
    throw new TypeError('The `algorithms` config option for JWTs must be an array of strings')
  }
  if (!publicKey) {
    throw new Error(
      `To authenticate JWTs you must pass the path to a public key file in either
the environment variable "AUTHENTICATION_KEY" or the publicKey config field
https://www.boltzmann.dev/en/docs/{{ version }}/reference/middleware/#authenticatejwt
`.trim().split('\n').join(' '))
  }
  _jwt = _jwt || require('jsonwebtoken')
  const verifyJWT = _jwt.verify

  return async next => {
    const publicKeyContents = (
      String(publicKey)[0] === '/'
      ? await fs.readFile(publicKey).catch(err => {
        console.error(`
          boltzmann authenticateJWT middleware cannot read public key at "${publicKey}".
          Is the AUTHENTICATION_KEY environment variable set correctly?
          Is the file readable?
          https://www.boltzmann.dev/en/docs/{{ version }}/reference/middleware/#authenticatejwt
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
        const logger = bole('boltzmann:jwt')
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
  if (isDev()) {
    const pretty = require('bistre')({ time: true })
    pretty.pipe(stream)
    stream = pretty
  }
  bole.output({ level, stream })

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
    if (String(request.headers['content-type']).split(';')[0].trim() === 'application/json') {
      const buf = await _collect(request)
      try {
        return JSON.parse(String(buf))
      } catch {
        const message = (
          isDev()
          ? 'Could not parse request body as JSON (Did the request include a `Content-Type: application/json` header?)'
          : 'Could not parse request body as JSON'
        )

        throw Object.assign(new Error(message), {
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

      if (isDev()) {
        context._honeycombTrace = trace
      }

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

let _uuid = null
let IN_MEMORY = new Map()
function session ({
  cookie = process.env.SESSION_ID || 'sid',
  secret = process.env.SESSION_SECRET,
  salt = process.env.SESSION_SALT,
  logger = bole('boltzmann:session'),
  load =
// {% if redis %}
  async (context, id) => JSON.parse(await context.redisClient.get(id) || '{}'),
// {% else %}
  async (context, id) => JSON.parse(IN_MEMORY.get(id)),
// {% endif %}
  save =
// {% if redis %}
  async (context, id, session) => {
    // Add 5 seconds of lag
    await context.redisClient.setex(id, expirySeconds + 5, JSON.stringify(session))
  },
// {% else %}
  async (context, id, session) => IN_MEMORY.set(id, JSON.stringify(session)),
// {% endif %}
  iron = {},
  cookieOptions = {},
  expirySeconds = 60 * 60 * 24 * 365
} = {}) {
  let _iron = null

  expirySeconds = Number(expirySeconds) || 0
  if (typeof load !== 'function') {
    throw new TypeError('`load` must be a function, got ' + typeof load)
  }

  if (typeof save !== 'function') {
    throw new TypeError('`save` must be a function, got ' + typeof save)
  }

  secret = Buffer.isBuffer(secret) ? secret : String(secret)
  if (secret.length < 32) {
    throw new RangeError('`secret` must be a string or buffer at least 32 units long')
  }

  salt = Buffer.isBuffer(salt) ? salt : String(salt)
  if (salt.length == 0) {
    throw new RangeError('`salt` must be a string or buffer at least 1 unit long; preferably more')
  }

  return next => {
    return async context => {
      let _session = null
      context._loadSession = async () => {
        if (_session) {
          return _session
        }

        const sessid = context.cookie.get(cookie)
        if (!sessid) {
          _session = new Session(null, [['created', Date.now()]])
          return _session
        }

        _iron = _iron || require('@hapi/iron')
        _uuid = _uuid || require('uuid')

        let clientId
        try {
          clientId = String(await _iron.unseal(sessid.value, secret, { ..._iron.defaults, ...iron }))
        } catch (err) {
          logger.warn(`removing session that failed to decrypt; request_id="${context.id}"`)
          _session = new Session(null, [['created', Date.now()]])
          return _session
        }

        if (!clientId.startsWith('s_') || !_uuid.validate(clientId.slice(2).split(':')[0])) {
          logger.warn(`caught malformed session; clientID="${clientId}"; request_id="${context.id}"`)
          throw new BadSessionError()
        }

        const id = `s:${crypto.createHash('sha256').update(clientId).update(salt).digest('hex')}`

        const sessionData = await load(context, id)
        _session = new Session(clientId, Object.entries(sessionData))

        return _session
      }

      const response = await next(context)

      if (!_session) {
        return response
      }

      if (!_session.dirty) {
        return response
      }

      _uuid = _uuid || require('uuid')

      const needsReissue = !_session.id || _session[REISSUE]
      const issued = Date.now()
      const clientId = needsReissue ? `s_${_uuid.v4()}:${issued}` : _session.id
      const id = `s:${crypto.createHash('sha256').update(clientId).update(salt).digest('hex')}`

      _session.set('modified', issued)
      await save(context, id, Object.fromEntries(_session.entries()))

      if (needsReissue) {
        _iron = _iron || require('@hapi/iron')

        const sealed = await _iron.seal(clientId, secret, { ..._iron.defaults, ...iron })

        context.cookie.set(cookie, {
          value: sealed,
          httpOnly: true,
          sameSite: true,
          maxAge: expirySeconds,
          ...(expirySeconds ? {} : {expires: new Date(Date.now() + 1000 * expirySeconds)}),
          ...cookieOptions
        })
      }

      return response
    }
  }
}

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
  },
  extraReachability = _requireOr('./reachability', {})
} = {}) {
  return async next => {
    reachability = { ...reachability, ...await extraReachability }

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
  const validator = ajvStrict.compile(schema && schema.isFluentSchema ? schema.valueOf() : schema)
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
    const validator = ajvLoose.compile(schema && schema.isFluentSchema ? schema.valueOf() : schema)
    return function validate (next) {
      return async (context, params, ...args) => {
        const subject = what(context)
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

function _processMiddleware (middleware) {
  return [].concat(Array.isArray(middleware) ? middleware : middleware.APP_MIDDLEWARE)
}

// {% if esm %}
async function _requireOr (target, value) {
  const candidates = [
    // {% if typescript %}
    `./${path.join(target, 'index.ts')}`,
    `${target}.ts`,
    // {% endif %}
    `./${path.join(target, 'index.mjs')}`,
    `${target}.mjs`,
    `./${path.join(target, 'index.js')}`,
    `${target}.js`,
  ]

  const items = await Promise.all(
    candidates.map(xs => fs.stat(xs).then(xs => xs.isFile(), () => false))
  )
  const resolved = candidates[items.findIndex(Boolean)]

  if (!resolved) {
    return value
  }

  return {...await import(resolved)}
}
// {% else %}
async function _requireOr (target, value) {
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
// {% endif %}

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

class BadSessionError extends Error {
  [STATUS] = 400
}

class Session extends Map {
  constructor(id, ...args) {
    super(...args)
    this.dirty = false
    this.id = id
  }

  reissue() {
    this[REISSUE] = true
  }

  set(key, value) {
    const old = this.get(key)
    if (value === old) {
      return super.set(key, value)
    }
    this.dirty = true
    return super.set(key, value)
  }

  delete(key) {
    if (!this.has(key)) {
      return super.delete(key)
    }
    this.dirty = true
    return super.delete(key)
  }
}

{{ EXPORTS }} const body = {
  json,
  urlEncoded
}
{{ EXPORTS }} const decorators = {
  validate: {
    body: validateBody,
    query: validateBlock(ctx => ctx.query),
    params: validateBlock(ctx => ctx.params)
  },
  test
}
{{ EXPORTS }} const middleware = {
// {% if jwt %}
  authenticateJWT,
// {% endif %}

// {% if oauth %}
  oauth,
  handleOAuthLogin,
  handleOAuthLogout,
  handleOAuthCallback,
// {% endif %}
// {% if staticfiles %}
  staticfiles,
// {% endif %}
// {% if esbuild %}
  esbuild,
// {% endif %}

// {% if templates %}
  template,
  templateContext,
// {% endif %}
  applyXFO,
  handleCORS,
  session,
// {% if csrf %}
  applyCSRF,
// {% endif %}
  ...decorators // forwarding these here.
}

// {% if not esm %}
exports.Context = Context
exports.main = main
exports.middleware = middleware
exports.body = body
exports.decorators = decorators
exports.routes = routes
exports.printRoutes = printRoutes
// {% if esbuild %}
exports.buildAssets = buildAssets
// {% endif %}
// {% endif %}

// {% if not selftest %}
// {% if esm %}
const isEval = ['-e', '--eval', '-p', '--print'].some(xs => process.execArgv.includes(xs))
// {% endif %}
if ({% if esm %}!isEval && esMain(import.meta){% else %}require.main === module{% endif %}) {
  main({
    middleware: _requireOr('./middleware', []).then(_processMiddleware).then(mw => [
      // {% if honeycomb %}
      trace,
      // {% endif %}
      // {% if ping %}
      handlePing,
      // {% endif %}
      // {% if livereload %}
      isDev() ? livereload : null,
      // {% endif %}
      log,

      // {% if redis %}
      attachRedis,
      // {% endif %}
      // {% if postgres %}
      attachPostgres,
      // {% endif %}
      ...mw,
      // {% if status %}
      ...[handleStatus]
      // {% endif %}
    ].filter(Boolean))
  }).then(server => {
    server.listen(Number(process.env.PORT) || 5000, () => {
      bole('boltzmann:server').info(`now listening on port ${server.address().port}`)
    })
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

  test('_requireOr only returns default for top-level failure', async assert => {
    // {% if esm %}
    await fs.writeFile(path.join(__dirname, 'require-or-test.js'), 'import "./does-not-exist"')
    // {% else %}
    await fs.writeFile(path.join(__dirname, 'require-or-test'), 'const x = require("does-not-exist")')
    // {% endif %}

    try {
      await _requireOr('./require-or-test', [])
      assert.fail('expected to fail with MODULE_NOT_FOUND')
    } catch (err) {
      // {% if esm %}
      assert.equals(err.code, 'ERR_MODULE_NOT_FOUND')
      // {% else %}
      assert.equals(err.code, 'MODULE_NOT_FOUND')
      // {% endif %}
    }
  })

  test('_requireOr returns default if toplevel require fails', async assert => {
    const expect = {}
    assert.equals(await _requireOr('./d-n-e', expect), expect)
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
    assert.equals(parsed.message, 'Could not find route for GET /')

    if (isDev()) {
      assert.ok('stack' in parsed)
    }
  })

  test('200 ok: json; returns expected headers and response', async assert => {
    const handler = () => {
      return { message: 'hello world' }
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
    assert.equals(response.headers['content-type'], 'application/json; charset=utf-8')
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

  test('decorators forward their args', async assert => {
    let called = null
    const handler = (context, params) => {
      called = params
    }
    handler.route = 'GET /:foo/:bar'
    handler.decorators = [
      next => (...args) => next(...args)
    ]
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
      url: '/hello/world'
    })

    assert.same(called, {
      foo: 'hello',
      bar: 'world'
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
    assert.equals(response.headers['content-type'], 'application/json; charset=utf-8')
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
    assert.equals(response.headers['content-type'], 'application/json; charset=utf-8')
    assert.equals(parsed.message, 'wuh oh')

    assert.ok(!('stack' in parsed))
  })

  test('reset env', async _ => {
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
    const handler = await authenticateJWT({ publicKey: 'unused' })(context => {
      ++called
      return 'ok'
    })

    const result = await handler({headers: {}})

    assert.equal(called, 1)
    assert.equal(result, 'ok')
  })

  test('jwt ignores requests with authorization header that do not match configured scheme', async assert => {
    let called = 0
    const handler = await authenticateJWT({ publicKey: 'unused' })(context => {
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
    const handler = await authenticateJWT({ publicKey: 'unused' })(context => {
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

  test('authenticateJWT() ensures `algorithms` is an array', async assert => {
    let caught = 0
    try {
      authenticateJWT({ publicKey: 'unused', algorithms: { object: 'Object' } })
    } catch (err) {
      caught++
    }
    assert.equal(caught, 1)
    try {
      authenticateJWT({ publicKey: 'unused', algorithms: 'foo' })
    } catch (err) {
      caught++
    }
    assert.equal(caught, 1)
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
    const decor = decorators.validate.query({
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

  test('context.cookie contains the request cookies', async assert => {
    let called = 0
    const handler = async context => {
      ++called
      assert.same(context.cookie.get('foo'), {
        value: 'bar',
        secure: true,
        sameSite: true,
        httpOnly: true
      })

      assert.same(context.cookie.get('hello'), {
        value: 'world',
        secure: true,
        sameSite: true,
        httpOnly: true
      })
    }

    handler.route = 'GET /'
    const server = await main({
      middleware: [],
      handlers: {
        handler
      }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/',
      headers: {
        'cookie': 'foo=bar; hello=world'
      }
    })

    assert.equals(response.statusCode, 204)
    assert.ok(!('set-cookie' in response.headers))
  })

  test('context.cookie.set creates cookies', async assert => {
    let called = 0
    const handler = async context => {
      ++called
      context.cookie.delete('foo')
      context.cookie.set('zu', 'bat')
      context.cookie.set('hello', {
        value: 'world',
        httpOnly: false
      })
    }

    handler.route = 'GET /'
    const server = await main({
      middleware: [],
      handlers: {
        handler
      }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/',
      headers: {
        'cookie': 'foo=bar; hello=world'
      }
    })


    const parsed = response.headers['set-cookie'].sort()

    assert.equal(parsed.length, 3)
    assert.matches(parsed[0], /foo=null; Max-Age=0; Expires=.* GMT; HttpOnly/)
    assert.matches(parsed[1], /hello=world; Secure; SameSite=Strict/)
    assert.matches(parsed[2], /zu=bat; HttpOnly; Secure; SameSite=Strict/)
  })

  test('template middleware intercepts template symbol responses', async assert => {
    let called = 0
    const handler = async context => {
      ++called
      return {
        [TEMPLATE]: 'test.html',
        greeting: 'hello'
      }
    }

    await fs.writeFile(path.join(__dirname, 'templates', 'test.html'), `
      {% raw %}{{ greeting }} world{% endraw %}
    `.trim())

    handler.route = 'GET /'
    const server = await main({
      middleware: [
        template
      ],
      handlers: {
        handler
      }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/'
    })

    assert.equal(called, 1)
    assert.equal(response.payload, 'hello world')
  })

  test('template middleware allows custom filters', async assert => {
    let called = 0
    const handler = async context => {
      ++called
      return {
        [TEMPLATE]: 'test.html',
        greeting: 'hello'
      }
    }

    await fs.writeFile(path.join(__dirname, 'templates', 'test.html'), `
      {% raw %}{{ greeting|frobnify }} world{% endraw %}
    `.trim())

    handler.route = 'GET /'
    const server = await main({
      middleware: [
        [template, {
          filters: {
            // explicitly async to test our munging
            frobnify: async (xs) => xs + 'frob'
          }
        }]
      ],
      handlers: {
        handler
      }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/'
    })

    assert.equal(called, 1)
    assert.equal(response.payload, 'hellofrob world')
  })

  test('template middleware allows custom tags', async assert => {
    let called = 0
    const handler = async context => {
      ++called
      return {
        [TEMPLATE]: 'test.html',
        greeting: 'hello'
      }
    }

    class FrobTag {
      tags = ['frob']
      parse (parser, nodes, lexer) {
        const tok = parser.nextToken()
        const args = parser.parseSignature(null, true);
        parser.advanceAfterBlockEnd(tok.value);
        const body = parser.parseUntilBlocks('endfrob');
        parser.advanceAfterBlockEnd();
        return new nodes.CallExtension(this, 'run', args, [body]);
      }

      run (context, body) {
        return body().split(/\s+/).join('frob ') + 'frob'
      }
    }

    await fs.writeFile(path.join(__dirname, 'templates', 'test.html'), `
      {% raw %}{% frob %}{{ greeting }} world{% endfrob %}{% endraw %}
    `.trim())

    handler.route = 'GET /'
    const server = await main({
      middleware: [
        [template, {
          tags: {
            frob: new FrobTag()
          }
        }]
      ],
      handlers: {
        handler
      }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/'
    })

    assert.equal(called, 1)
    assert.equal(response.payload, 'hellofrob worldfrob')
  })

  test('template middleware custom filters may throw', async assert => {
    let called = 0
    process.env.NODE_ENV = ''
    const handler = async context => {
      ++called
      return {
        [TEMPLATE]: 'test.html',
        greeting: 'hello'
      }
    }

    await fs.writeFile(path.join(__dirname, 'templates', 'test.html'), `
      {% raw %}{{ greeting|frobnify }} world{% endraw %}
    `.trim())

    handler.route = 'GET /'
    const server = await main({
      middleware: [
        [template, {
          filters: {
            frobnify: (xs) => {
              throw new Error('oops oh no')
            }
          }
        }]
      ],
      handlers: {
        handler
      }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/'
    })

    assert.equal(called, 1)
    assert.matches(response.payload, /oops oh no/)
  })

  test('reset env', async _ => {
    process.env.NODE_ENV = 'test'
  })

  test('template errors are hidden in non-dev mode', async assert => {
    let called = 0
    const handler = async context => {
      ++called
      return {
        [TEMPLATE]: 'test.html',
        greeting: 'hello'
      }
    }

    await fs.writeFile(path.join(__dirname, 'templates', 'test.html'), `
      {% raw %}{{ greeting|frobnify }} world{% endraw %}
    `.trim())

    handler.route = 'GET /'
    const server = await main({
      middleware: [
        [template, {
          filters: {
            frobnify: (xs) => {
              throw new Error('oops oh no')
            }
          }
        }]
      ],
      handlers: {
        handler
      }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/'
    })

    assert.equal(called, 1)
    assert.notMatch(response.payload, /oops oh no/)
  })

  test('applyHeaders adds requested headers', async assert => {
    const handler = async context => {
      return 'woot'
    }

    handler.route = 'GET /'
    const server = await main({
      middleware: [[applyHeaders, { currency: 'zorkmid' }]],
      handlers: { handler }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/'
    })

    assert.equal(response.payload, 'woot')
    assert.equal(response.headers.currency, 'zorkmid')
  })

  test('applyXFO adds xfo header', async assert => {
    const handler = async context => {
      return 'woot'
    }

    handler.route = 'GET /'
    const server = await main({
      middleware: [
        [ applyXFO, 'DENY' ],
      ],
      handlers: {
        handler
      }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/'
    })

    assert.equal(response.headers['x-frame-options'], 'DENY')
  })

  test('cookie signature check short-circuits on length check', async assert => {
    const check = checkCookieSignature('womp.signature', 'not-very-secret')
    assert.equal(check, false)
  })

  test('csrf middleware requires a signing secret', async assert => {
    let server, error
    let threw = false
    try {
      server = await main({
        middleware: [ [ applyCSRF, {} ],],
        handlers: { }
      })
    } catch (ex) {
      threw = true
      error = ex
    }

    assert.ok(threw)
    assert.ok(/a secret for signing cookies/.test(error.message))
  })

  test('csrf middleware adds a token generator to the context', async assert => {
    let t
    const handler = async context => {
      assert.equal(typeof context.csrfToken, 'function')
      const t1 = context.csrfToken()
      const t2 = context.csrfToken()
      assert.equal(t1, t2)
      return t1
    }

    handler.route = 'GET /'
    const server = await main({
      middleware: [ [ applyCSRF, { cookieSecret: 'not-very-secret' } ],],
      handlers: { handler }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/'
    })
    assert.equal(response.statusCode, 200)
    assert.equal(typeof response.payload, 'string')
  })

  test('the token generator allows you to force a fresh token', async assert => {
    let t
    const handler = async context => {
      const t1 = context.csrfToken()
      const t2 = context.csrfToken({ refresh: true})
      const t3 = context.csrfToken({ refresh: false})
      assert.notEqual(t1, t2)
      assert.equal(t2, t3)
      return "my tokens are fresh"
    }

    handler.route = 'GET /'
    const server = await main({
      middleware: [ [ applyCSRF, { cookieSecret: 'not-very-secret' } ],],
      handlers: { handler }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/'
    })
    assert.equal(response.statusCode, 200)
    assert.equal(response.payload, "my tokens are fresh")
  })

  test('csrf middleware enforces presence of token on mutations', async assert => {
    let called = 0
    const handler = async context => {
      called++
      return 'no tokens at all'
    }

    handler.route = 'PUT /'
    const server = await main({
      middleware: [ [ applyCSRF, { cookieSecret: 'not-very-secret' } ],],
      handlers: { handler }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'PUT',
      url: '/',
      payload: { text: 'I am quite tokenless.' }
    })

    assert.equal(response.statusCode, 403)
    assert.ok(/Invalid CSRF token/.test(response.payload))
    assert.equal(called, 0)
  })

  test('csrf middleware accepts valid token in body', async assert => {
    const _c = require('cookie')

    let called = 0
    const handler = async context => {
      called++
      return 'my token is good'
    }

    const cookieSecret = 'avocados-are-delicious'
    const tokens = new CsrfTokens()
    const userSecret = await tokens.secret()
    const token = tokens.create(userSecret)
    const signedUserSecret = signCookie(userSecret, cookieSecret)

    handler.route = 'PUT /'
    const server = await main({
      middleware: [ [ applyCSRF, { cookieSecret } ],],
      handlers: { handler }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'PUT',
      url: '/',
      headers: { cookie: _c.serialize('_csrf', signedUserSecret) },
      payload: { '_csrf': token }
    })

    assert.equal(called, 1)
    assert.equal(response.statusCode, 200)
    assert.equal(response.payload, 'my token is good')
  })

  test('csrf middleware accepts valid token in headers', async assert => {
    const _c = require('cookie')

    let called = 0
    const handler = async context => {
      called++
      return 'my header token is good'
    }

    const cookieSecret = 'avocados-are-delicious'
    const tokens = new CsrfTokens()
    const userSecret = tokens.secretSync()
    const signedUserSecret = signCookie(userSecret, cookieSecret)
    const token = tokens.create(userSecret)

    handler.route = 'PUT /'
    const server = await main({
      middleware: [ [ applyCSRF, { cookieSecret, header: 'my-header' } ],],
      handlers: { handler }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'PUT',
      url: '/',
      headers: {
        cookie: _c.serialize('_csrf', signedUserSecret),
        'my-header': token
      },
      payload: {}
    })

    assert.equal(called, 1)
    assert.equal(response.statusCode, 200)
    assert.equal(response.payload, 'my header token is good')
  })

  test('csrf middleware rejects bad tokens', async assert => {
    const _c = require('cookie')

    let called = 0
    const handler = async context => {
      called++
      return 'my body token is bad'
    }

    const cookieSecret = 'avocados-are-delicious'
    const tokens = new CsrfTokens()
    const userSecret = tokens.secretSync()
    const signedUserSecret = signCookie(userSecret, cookieSecret)
    const token = tokens.create(userSecret)

    handler.route = 'PUT /'
    const server = await main({
      middleware: [ [ applyCSRF, { cookieSecret } ],],
      handlers: { handler }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'PUT',
      url: '/',
      headers: { cookie: _c.serialize('_csrf', signedUserSecret) },
      payload: { _csrf: 'bad-token-dudes' }
    })

    assert.equal(response.statusCode, 403)
    assert.ok(/Invalid CSRF token/.test(response.payload))
    assert.equal(called, 0)
  })

  test('csrf middleware ignores secrets with bad signatures', async assert => {
    const _c = require('cookie')

    let called = 0
    const handler = async context => {
      called++
      return 'my signature is bad'
    }

    const cookieSecret = 'avocados-are-delicious'
    const tokens = new CsrfTokens()
    const userSecret = tokens.secretSync()
    const signedUserSecret = signCookie(userSecret, 'cilantro-is-great')
    const token = tokens.create(userSecret)

    handler.route = 'PUT /'
    const server = await main({
      middleware: [ [ applyCSRF, { cookieSecret } ],],
      handlers: { handler }
    })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'PUT',
      url: '/',
      headers: { cookie: _c.serialize('_csrf', signedUserSecret) },
      payload: { _csrf: 'bad-token-dudes' }
    })

    assert.equal(response.statusCode, 403)
    assert.ok(/Invalid CSRF token/.test(response.payload))
    assert.equal(called, 0)
  })

  test('session middleware throws on malformed session data', async assert => {
    const _c = require('cookie')
    const _iron = require('@hapi/iron')

    const config = {
      secret: 'wow a great secret, just amazing wootles'.repeat(2),
      salt: 'potassium',
  }
    const handler = async context => {
      const s = await context.session
      return 'OK'
    }
    handler.route = 'GET /'
    const server = await main({
      middleware: [ [ session, config ] ],
      handlers: { handler }
    })

    const baddata = await _iron.seal("I-am-malformed", config.secret, { ..._iron.defaults })

    const [onrequest] = server.listeners('request')
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/',
      headers: { cookie: _c.serialize('sid', baddata) }
    })
    assert.equal(response.statusCode, 400)
  })

  test('applyXFO() ensures its option is DENY or SAMEORIGIN', async assert => {
    let caught = 0
    try {
      applyXFO('BADSTRING')
    } catch (_) {
      caught++
    }
    assert.equal(caught, 1)
    try {
      applyXFO('DENY')
    } catch (_) {
      caught++
    }
    assert.equal(caught, 1)
    try {
      applyXFO('SAMEORIGIN')
    } catch (_) {
      caught++
    }
    assert.equal(caught, 1)
  })

  test('template() ensures `paths` is an array', async assert => {
    let caught = 0
    try {
      template({ paths: { foo: 'bar' } })
    } catch (err) {
      assert.match(err.message, /must be an array/)
      caught++
    }
    assert.equal(caught, 1)
    try {
      template({ paths: 'foo' })
    } catch (err) {
      caught++
    }
    assert.equal(caught, 1)
    try {
      template({ paths: ['foo', 'bar'] })
    } catch (err) {
      caught++
    }
    assert.equal(caught, 1)
  })


}
// {% endif %}
