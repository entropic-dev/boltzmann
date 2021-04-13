// {% if selftest %}
import bole from '@entropic-dev/bole'
import isDev from 'are-we-dev'
import http from 'http'

import { MiddlewareConfig, handler, buildMiddleware, Handler } from '../core/middleware'
import { BodyParserDefinition, buildBodyParser } from '../core/body'
import { route } from '../middleware/route'
import { Context } from '../data/context'
import { _requireOr, _processMiddleware, _processBodyParsers } from '../utils'

import { urlEncoded } from '../body/urlencoded'
import { json } from '../body/json'
const STATUS = Symbol.for('status')
const HEADERS = Symbol.for('headers')
const THREW = Symbol.for('threw')
// {% endif %}

interface DebugLocationInfo {
  name: string,
  location: string
}
/* {% if selftest %} */export /* {% endif %} */async function main ({
  middleware = _requireOr('./middleware', []).then(_processMiddleware),
  bodyParsers = _requireOr('./body', [urlEncoded, json]).then(_processBodyParsers),
  handlers = _requireOr('./handlers', {}),
}: {
  middleware?: MiddlewareConfig[] | Promise<MiddlewareConfig[]>,
  bodyParsers?: BodyParserDefinition[] | Promise<BodyParserDefinition[]>,
  handlers?: Record<string, Handler> | Promise<Record<string, Handler>>
}= {}) {
  const [resolvedMiddleware, resolvedBodyParsers, resolvedHandlers] = await Promise.all([
    <Promise<MiddlewareConfig[]>>middleware,
    <Promise<BodyParserDefinition[]>>bodyParsers,
    <Promise<Record<string, Handler>>>handlers,
  ])

  const server = http.createServer()
  let isClosing = false

  // When we're not in dev, handle SIGINT gracefully. Gracefully let open
  // connections complete, but let them know not to keep-alive!
  if (!isDev()) {
    process.on('SIGINT', () => {
      if (isClosing) {
        process.exit(1)
      }
      const logger = bole('boltzmann:server')
      logger.info('Caught SIGINT, preparing to shutdown. If running on the command line another ^C will close the app immediately.')
      isClosing = true
      server.close()
    })
  }

  const respond = await buildMiddleware([[route, resolvedHandlers], ...resolvedMiddleware], handler)
  Context._bodyParser = buildBodyParser(resolvedBodyParsers)

  // {% if templates %}
  let _middleware: DebugLocationInfo[] = []
  if (isDev() && !process.env.TAP) {
    const getFunctionLocation = require('get-function-location')
    _middleware = await Promise.all(resolvedMiddleware.map(async (xs: MiddlewareConfig): Promise<DebugLocationInfo> => {
      const fn = (Array.isArray(xs) ? xs[0] : xs)
      const loc = await getFunctionLocation(fn)
      return {
        name: String(fn.name),
        location: `${loc.source.replace('file://', 'vscode://file')}:${loc.line}:${loc.column}`
      }
    }))
  }
  // {% endif %}

  server.on('request', async (req, res) => {
    const context = new Context(req, res)

    // {% if templates %}
    if (isDev()) {
      context._handlers = resolvedHandlers
      context._middleware = _middleware
    }
    // {% endif %}

    let body = await respond(context)

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

    if (context.hasCookie) {
      const setCookie = context.cookie.collect()
      if (setCookie.length) {
        headers['set-cookie'] = setCookie
      }
    }

    headers['x-clacks-overhead'] = 'GNU/Terry Pratchett'
    if (isClosing) {
      headers.connection = isClosing ? 'close' : 'keep-alive'
    }

    res.writeHead(status, headers)
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
