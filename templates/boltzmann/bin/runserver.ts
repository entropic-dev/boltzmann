void `{% if selftest %}`;
import bole from '@entropic/bole'
import {inject} from '@hapi/shot'
import isDev from 'are-we-dev'
import http from 'http'
import querystring from 'querystring'
import tap from 'tap'

import {buildMiddleware, handler, Handler, MiddlewareConfig} from '../core/middleware'
import {_processBodyParsers, _processMiddleware, _requireOr} from '../core/utils'
import {BodyParser, BodyParserDefinition, buildBodyParser} from '../core/body'
import {STATUS, HEADERS, THREW} from '../core/prelude'
import {urlEncoded} from '../body/urlencoded'
import {route} from '../middleware/route'
import {Context} from '../data/context'
import {json} from '../body/json'

export { runserver }
void `{% endif %}`;

interface DebugLocationInfo {
  name: string,
  location: string
}
async function runserver ({
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

  Context._bodyParser = buildBodyParser(resolvedBodyParsers)
  const respond = await buildMiddleware([[route, resolvedHandlers], ...resolvedMiddleware], handler)

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

void `{% if selftest %}`;
import {Test} from '../middleware/test'
/* istanbul ignore next */
if (require.main === module) {
  const { test } = tap

  test('empty server; router handles 404', async (assert: Test) => {
    const server = await runserver({
      middleware: [],
      bodyParsers: [],
      handlers: {},
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })

    assert.equal(response.statusCode, 404)
    const parsed = JSON.parse(response.payload)
    assert.equal(parsed.message, 'Could not find route for GET /')

    if (isDev()) {
      assert.ok('stack' in parsed)
    }
  })

  test('200 ok: json; returns expected headers and response', async (assert: Test) => {
    const handler = () => {
      return { message: 'hello world' }
    }
    handler.route = 'GET /'
    const server = await runserver({
      middleware: [],
      bodyParsers: [],
      handlers: {
        handler,
      },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })

    assert.equal(response.statusCode, 200)
    const parsed = JSON.parse(response.payload)
    assert.equal(response.headers['content-type'], 'application/json; charset=utf-8')
    assert.same(parsed, { message: 'hello world' })
  })

  test('200 ok: string; returns expected headers and response', async (assert: Test) => {
    const handler = () => {
      return 'hi there'
    }
    handler.route = 'GET /'
    const server = await runserver({
      middleware: [],
      bodyParsers: [],
      handlers: {
        handler,
      },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })

    assert.equal(response.statusCode, 200)
    assert.equal(response.headers['content-type'], 'text/plain; charset=utf-8')
    assert.same(response.payload, 'hi there')
  })

  test('204 no content', async (assert: Test) => {
    const handler = () => {}
    handler.route = 'GET /'
    const server = await runserver({
      middleware: [],
      bodyParsers: [],
      handlers: {
        handler,
      },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })

    assert.equal(response.statusCode, 204)
    assert.same(response.payload, '')
  })

  test('throwing an error results in 500 internal server error', async (assert) => {
    const handler = () => {
      throw new Error('wuh oh')
    }
    handler.route = 'GET /'
    const server = await runserver({
      middleware: [],
      bodyParsers: [],
      handlers: {
        handler,
      },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })

    assert.equal(response.statusCode, 500)
    const parsed = JSON.parse(response.payload)
    assert.equal(response.headers['content-type'], 'application/json; charset=utf-8')
    assert.equal(parsed.message, 'wuh oh')

    if (isDev()) {
      assert.ok('stack' in parsed)
    }
  })

  test('throwing an error in non-dev mode results in 500 internal server error w/no stack', async (assert) => {
    const handler = () => {
      throw new Error('wuh oh')
    }
    handler.route = 'GET /'
    const server = await runserver({
      middleware: [],
      bodyParsers: [],
      handlers: {
        handler,
      },
    })

    process.env.NODE_ENV = 'prod'
    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })

    assert.equal(response.statusCode, 500)
    const parsed = JSON.parse(response.payload)
    assert.equal(response.headers['content-type'], 'application/json; charset=utf-8')
    assert.equal(parsed.message, 'wuh oh')

    assert.ok(!('stack' in parsed))
  })

  test('reset env', async (_) => {
    process.env.NODE_ENV = 'test'
  })

  test('return a pipe-able response', async (assert) => {
    const { Readable } = require('stream')

    const handler = () => {
      const chunks = ['hi ', 'there ', 'world', null]
      return new Readable({
        read() {
          const next = chunks.shift()
          if (next !== undefined) {
            this.push(next)
          }
        },
      })
    }
    handler.route = 'GET /'
    const server = await runserver({
      middleware: [],
      bodyParsers: [],
      handlers: {
        handler,
      },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })

    assert.equal(response.statusCode, 200)
    assert.equal(response.headers['content-type'], 'application/octet-stream')
    assert.equal(response.payload, 'hi there world')
  })

  test('router: accept-version is respected', async (assert) => {
    const old = async () => {
      return 'old'
    }
    old.route = 'GET /'

    const neue = async () => {
      return 'new'
    }
    neue.route = 'GET /'
    neue.version = '420.0.0'

    const server = await runserver({
      middleware: [],
      bodyParsers: [],
      handlers: {
        old,
        neue,
      },
    })

    const [onrequest] = server.listeners('request')
    {
      const response = await inject(<any>onrequest, {
        method: 'GET',
        url: '/',
      })

      assert.equal(response.statusCode, 200)
      assert.equal(response.payload, 'old')
    }

    {
      const response = await inject(<any>onrequest, {
        method: 'GET',
        url: '/',
        headers: { 'accept-version': '*' },
      })

      assert.equal(response.statusCode, 200)
      assert.equal(response.payload, 'new')
      assert.same(response.headers.vary, ['accept-version'])
    }
  })

  test('body: custom body parsers on handler are used', async (assert) => {
    const handler = async (context: Context) => {
      return await context.body
    }
    handler.route = 'GET /'
    handler.bodyParsers = [() => () => 'flooble']
    const server = await runserver({
      middleware: [],
      bodyParsers: [urlEncoded],
      handlers: {
        handler,
      },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: querystring.stringify({ hello: 'world' }),
    })

    assert.equal(response.statusCode, 200)
    assert.same(String(response.payload), 'flooble')
  })

  test('body: custom body parsers on handler do not effect other handlers', async (assert) => {
    const handler = async (context: Context) => {
      return await context.body
    }
    handler.bodyParsers = [() => () => 'flooble']
    handler.route = 'GET /'
    const otherHandler = async (context: Context) => {
      return await context.body
    }
    otherHandler.route = 'GET /other'
    const server = await runserver({
      middleware: [],
      bodyParsers: [urlEncoded],
      handlers: {
        handler,
        otherHandler,
      },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: querystring.stringify({ hello: 'world' }),
    })

    assert.equal(response.statusCode, 200)
    assert.same(String(response.payload), 'flooble')

    const anotherResponse = await inject(<any>onrequest, {
      method: 'GET',
      url: '/other',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: querystring.stringify({ hello: 'world' }),
    })

    assert.equal(anotherResponse.statusCode, 200)
    assert.same(JSON.parse(anotherResponse.payload), { hello: 'world' })
  })

  test('body: context.body can be set explicitly', async (assert) => {
    const handler = async (context: Context) => {
      context.body = <any>'three ducks'
      return await context.body
    }
    handler.route = 'GET /'
    const otherHandler = async (context: Context) => {
      return await context.body
    }
    otherHandler.route = 'GET /other'
    const server = await runserver({
      middleware: [],
      bodyParsers: [urlEncoded],
      handlers: {
        handler,
        otherHandler,
      },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: querystring.stringify({ hello: 'world' }),
    })

    assert.equal(response.statusCode, 200)
    assert.same(String(response.payload), 'three ducks') // in THIS ECONOMY?!
  })
}
void `{% endif %}`;
