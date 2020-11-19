#!/usr/bin/env node
/* eslint-disable */
/* istanbul ignore file */
'use strict'
// Boltzmann v0.2.0-alpha1

// 
// 
// 

const serviceName = (
  process.env.SERVICE_NAME ||
  require('./package.json').name.split('/').pop()
)

// 
const beeline = require('honeycomb-beeline')({
  writeKey: process.env.HONEYCOMBIO_WRITE_KEY,
  dataset: process.env.HONEYCOMBIO_DATASET,
  serviceName
})
const onHeaders = require('on-headers')
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
const crypto = require('crypto')
// 
const CsrfTokens = require('csrf')
// 
const http = require('http')
const bole = require('bole')
const path = require('path')
const os = require('os')
// 
const redis = require('handy-redis')
// 
// 

const THREW = Symbol.for('threw')
const STATUS = Symbol.for('status')
const REISSUE = Symbol.for('reissue')
const HEADERS = Symbol.for('headers')
const TEMPLATE = Symbol.for('template')
const TRACE_HTTP_HEADER = 'x-honeycomb-trace'

let ajv = null
let ajvLoose = null
let ajvStrict = null

 async function main ({
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

  // 
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
  // 

  server.on('request', async (req, res) => {
    const context = new Context(req, res)

    // 
    if (isDev()) {
      context._handlers = handlers
      context._middleware = _middleware
    }
    // 

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
    this._loadSession = async () => {
      throw new Error('To use context.session, attach session middleware to your app')
    }

    // 
    this._redisClient = null
    // 
    // 
  }

  // 

  get cookie () {
    this._cookie = this._cookie || Cookie.from(this.headers.cookie || '')
    return this._cookie
  }

  /** @type {Promise<Session>} */
  get session () {
    return this._loadSession()
  }

  // 
  /** @type {redis.IHandyRedis} */
  get redisClient () {
    return this._redisClient
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

  // 
  get traceURL () {
    const url = new URL(`https://ui.honeycomb.io/${process.env.HONEYCOMBIO_TEAM}/datasets/${process.env.HONEYCOMBIO_DATASET}/trace`)
    url.searchParams.set('trace_id', this._honeycombTrace.payload['trace.trace_id'])
    url.searchParams.set('trace_start_ts', Math.floor(this._honeycombTrace.startTime/1000 - 1))
    return String(url)
  }
  // 

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

 async function routes (handlers = _requireOr('./handlers')) {
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

// 

 async function printRoutes () {
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
      // 
      if (isDev()) {
        const getFunctionLocation = require('get-function-location')
        const loc = await getFunctionLocation(handler)
        location = `${loc.source.replace('file://', 'vscode://file')}:${loc.line}:${loc.column}`
      }
      // 

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

    // 
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
      // 
      return match.handler(context, match.params, match.store, null)
      // 
    } finally {
      if (process.env.HONEYCOMBIO_WRITE_KEY) {
        beeline.finishSpan(span)
      }
    }
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
      honeycombMiddlewareSpans(mw),
      // 
      dev(mw),
      enforceInvariants()
    ]
    : (mw) => [
      // 
      honeycombMiddlewareSpans(mw),
      // 
      enforceInvariants()
    ]
  )
  const result = middleware.reduce((lhs, rhs) => {
    const [mw, ...args] = Array.isArray(rhs) ? rhs : [rhs]
    return [...lhs, ...middlewareToSplice(mw), mw(...args)]
  }, []).concat(middlewareToSplice({ name: 'router' }))

  // 
  // drop the outermost honeycombMiddlewareSpans mw.
  result.shift()
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
          if (body && body[TEMPLATE]) {
            headers['content-type'] = 'text/html; charset=utf-8'
          } else {
            headers['content-type'] = 'application/json; charset=utf-8'
          }
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
function template ({
  paths = ['templates'],
  filters = {},
  tags = {},
  logger = bole('BOLTZMANN:templates'),
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

  // 
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
  // 

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
// 

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

// 

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

const applyXFO = (mode) => {
  if (!['DENY', 'SAMEORIGIN'].includes(mode)) {
    throw new Error('applyXFO(): Allowed x-frame-options directives are DENY and SAMEORIGIN.')
  }
  return applyHeaders({ 'x-frame-options': mode })
}

// 
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
// 

// 

// 

// 

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

// 
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

// 

let _uuid = null
let IN_MEMORY = new Map()
function session ({
  cookie = process.env.SESSION_ID || 'sid',
  secret = process.env.SESSION_SECRET,
  salt = process.env.SESSION_SALT,
  logger = bole('BOLTZMANN:session'),
  load =
// 
  async (context, id) => JSON.parse(await context.redisClient.get(id) || '{}'),
// 
  save =
// 
  async (context, id, session) => {
    // Add 5 seconds of lag
    await context.redisClient.setex(id, expirySeconds + 5, JSON.stringify(session))
  },
// 
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

// 
function attachRedis ({ url = process.env.REDIS_URL } = {}) {
  return next => {
    const client = redis.createHandyClient({ url })
    return async function redis (context) {
      context._redisClient = client
      return next(context)
    }
  }
}
// 
// 

// 
function handleStatus ({
  git = process.env.GIT_COMMIT,
  reachability = {
    // 
    // 
    redisReachability,
    // 
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
// - - - - - - - - - - - - - - - -
// Reachability Checks
// - - - - - - - - - - - - - - - -
// 
// 

// 
async function redisReachability (context, meta) {
  await context.redisClient.ping()
}
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
  // 

  // 
  const redisClient = redis.createHandyClient(`redis://localhost:6379/7`)
  middleware = Promise.resolve(middleware).then(mw => {
    mw.push(() => next => async context => {
      context._redisClient = redisClient
      return next(context)
    })

    return mw
  })
  // 

  // 
  after(() => {
    // 
    // 
    redisClient.quit()
    // 
  })
  // 

  return inner => async assert => {
    [handlers, bodyParsers, middleware] = await Promise.all([handlers, bodyParsers, middleware])
    // 
    assert.redisClient = redisClient
    // 

    // 
    // 
    await redisClient.flushdb()
    middleware.push(() => next => async context => {
      context._redisClient = redisClient
      return next(context)
    })
    assert.redisClient = redisClient
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

// 
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
// 

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

 const body = {
  json,
  urlEncoded
}
 const decorators = {
  validate: {
    body: validateBody,
    query: validateBlock(ctx => ctx.query),
    params: validateBlock(ctx => ctx.params)
  },
  test
}
 const middleware = {
// 

// 
// 
// 

// 
  template,
  templateContext,
// 
  applyXFO,
  handleCORS,
  session,
// 
  applyCSRF,
// 
  ...decorators // forwarding these here.
}

// 
exports.Context = Context
exports.main = main
exports.middleware = middleware
exports.body = body
exports.decorators = decorators
exports.routes = routes
exports.printRoutes = printRoutes
// 
// 

// 
// 
if (require.main === module) {
  main({
    middleware: _requireOr('./middleware', []).then(_processMiddleware).then(mw => [
      // 
      trace,
      // 
      // 
      handlePing,
      // 
      // 
      log,

      // 
      attachRedis,
      // 
      // 
      ...mw,
      // 
      ...[handleStatus]
      // 
    ].filter(Boolean))
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
