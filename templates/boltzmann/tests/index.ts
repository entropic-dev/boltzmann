// tbh, I'd like to move each of these tests into the files themselves.
import {createReadStream, promises as fs} from 'fs'
import path from 'path'
import tap from 'tap'
import {_requireOr} from '../utils'

const { test } = tap

test('_requireOr only returns default for top-level failure', async (assert) => {
  await fs.writeFile(path.join(__dirname, 'require-or-test'), 'const x = require("does-not-exist")')

  try {
    await _requireOr('./require-or-test', [])
    assert.fail('expected to fail with MODULE_NOT_FOUND')
  } catch (err) {
    assert.equals(err.code, 'MODULE_NOT_FOUND')
  }
})

test('_requireOr returns default if toplevel require fails', async (assert) => {
  const expect = {}
  assert.equals(await _requireOr('./d-n-e', expect), expect)
})

test('_collect takes a stream and returns a promise for a buffer of its content', async (assert) => {
  const result = await _collect(createReadStream(__filename))
  const expect = await fs.readFile(__filename)

  assert.equals(String(result), String(expect))
})

test('empty server; router handles 404', async (assert) => {
  const server = await main({
    middleware: [],
    bodyParsers: [],
    handlers: {},
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })

  assert.equals(response.statusCode, 404)
  const parsed = JSON.parse(response.payload)
  assert.equals(parsed.message, 'Could not find route for GET /')

  if (isDev()) {
    assert.ok('stack' in parsed)
  }
})

test('200 ok: json; returns expected headers and response', async (assert) => {
  const handler = () => {
    return { message: 'hello world' }
  }
  handler.route = 'GET /'
  const server = await main({
    middleware: [],
    bodyParsers: [],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })

  assert.equals(response.statusCode, 200)
  const parsed = JSON.parse(response.payload)
  assert.equals(response.headers['content-type'], 'application/json; charset=utf-8')
  assert.same(parsed, { message: 'hello world' })
})

test('200 ok: string; returns expected headers and response', async (assert) => {
  const handler = () => {
    return 'hi there'
  }
  handler.route = 'GET /'
  const server = await main({
    middleware: [],
    bodyParsers: [],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })

  assert.equals(response.statusCode, 200)
  assert.equals(response.headers['content-type'], 'text/plain; charset=utf-8')
  assert.same(response.payload, 'hi there')
})

test('204 no content', async (assert) => {
  const handler = () => {}
  handler.route = 'GET /'
  const server = await main({
    middleware: [],
    bodyParsers: [],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })

  assert.equals(response.statusCode, 204)
  assert.same(response.payload, '')
})

test('context.url may be set to a url', async (assert) => {
  let called = null
  const handler = (context, params) => {
    context.url = new URL('/hello/world', 'https://www.womp.com/')
    called = context.url
  }
  handler.route = 'GET /'
  const server = await main({
    middleware: [],
    bodyParsers: [],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })

  assert.equal(called.pathname, '/hello/world')
  assert.same(response.payload, '')
})

test('decorators forward their args', async (assert) => {
  let called = null
  const handler = (context, params) => {
    called = params
  }
  handler.route = 'GET /:foo/:bar'
  handler.decorators = [(next) => (...args) => next(...args)]
  const server = await main({
    middleware: [],
    bodyParsers: [],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/hello/world',
  })

  assert.same(called, {
    foo: 'hello',
    bar: 'world',
  })
  assert.equals(response.statusCode, 204)
  assert.same(response.payload, '')
})

test('throwing an error results in 500 internal server error', async (assert) => {
  const handler = () => {
    throw new Error('wuh oh')
  }
  handler.route = 'GET /'
  const server = await main({
    middleware: [],
    bodyParsers: [],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })

  assert.equals(response.statusCode, 500)
  const parsed = JSON.parse(response.payload)
  assert.equals(response.headers['content-type'], 'application/json; charset=utf-8')
  assert.equals(parsed.message, 'wuh oh')

  if (isDev()) {
    assert.ok('stack' in parsed)
  }
})

test('throwing an error in non-dev mode results in 500 internal server error w/no stack', async (assert) => {
  const handler = () => {
    throw new Error('wuh oh')
  }
  handler.route = 'GET /'
  const server = await main({
    middleware: [],
    bodyParsers: [],
    handlers: {
      handler,
    },
  })

  process.env.NODE_ENV = 'prod'
  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })

  assert.equals(response.statusCode, 500)
  const parsed = JSON.parse(response.payload)
  assert.equals(response.headers['content-type'], 'application/json; charset=utf-8')
  assert.equals(parsed.message, 'wuh oh')

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
  const server = await main({
    middleware: [],
    bodyParsers: [],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })

  assert.equals(response.statusCode, 200)
  assert.equals(response.headers['content-type'], 'application/octet-stream')
  assert.equals(response.payload, 'hi there world')
})

test('context: has expected properties', async (assert) => {
  const mockRequest = {
    socket: {
      remoteAddress: '::80',
    },
    headers: {
      host: 'example.com:443',
      accept: 'text/plain;q=0.9, text/html;q=0.8',
    },
    url: 'https://example.com/hello?there=1',
    method: 'PROPFIND',
  }
  const now = Date.now()
  const ctx = new Context(mockRequest)

  assert.ok(ctx.start >= now)
  assert.equals(ctx.host, 'example.com')
  assert.equals(ctx.url.pathname, '/hello')
  assert.equals(ctx.query.there, '1')

  ctx._parsedUrl = { pathname: '/floo' }
  assert.equals(ctx.url.pathname, '/floo')
  assert.equals(ctx.headers, ctx.request.headers)
  assert.equals(ctx.method, ctx.request.method)

  assert.equals(ctx.accepts.type(['text/html', 'text/plain', 'application/json']), 'text/plain')

  ctx._accepts = accepts({ headers: { accept: '*/*' } })
  assert.equals(ctx.accepts.type(['text/html', 'text/plain', 'application/json']), 'text/html')
})

test('context: default body parser returns 415', async (assert) => {
  const handler = async (context) => {
    await context.body
  }
  handler.route = 'GET /'
  const server = await main({
    middleware: [],
    bodyParsers: [],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })

  assert.equals(response.statusCode, 415)
  assert.equals(JSON.parse(response.payload).message, 'Cannot parse request body')
})

test('router: accept-version is respected', async (assert) => {
  const old = async (context) => {
    return 'old'
  }
  old.route = 'GET /'

  const neue = async (context) => {
    return 'new'
  }
  neue.route = 'GET /'
  neue.version = '420.0.0'

  const server = await main({
    middleware: [],
    bodyParsers: [],
    handlers: {
      old,
      neue,
    },
  })

  const [onrequest] = server.listeners('request')
  {
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/',
    })

    assert.equals(response.statusCode, 200)
    assert.equals(response.payload, 'old')
  }

  {
    const response = await shot.inject(onrequest, {
      method: 'GET',
      url: '/',
      headers: { 'accept-version': '*' },
    })

    assert.equals(response.statusCode, 200)
    assert.equals(response.payload, 'new')
    assert.same(response.headers.vary, ['accept-version'])
  }
})

test('json body: returns 415 if request is not application/json', async (assert) => {
  const handler = async (context) => {
    await context.body
  }
  handler.route = 'GET /'
  const server = await main({
    middleware: [],
    bodyParsers: [json],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })

  assert.equals(response.statusCode, 415)
  assert.equals(JSON.parse(response.payload).message, 'Cannot parse request body')
})

test('json body: returns 422 if request is application/json but contains bad json', async (assert) => {
  const handler = async (context) => {
    await context.body
  }
  handler.route = 'GET /'
  const server = await main({
    middleware: [],
    bodyParsers: [json],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
    headers: {
      'content-type': 'application/json',
    },
    payload: 'dont call me json',
  })

  assert.equals(response.statusCode, 422)
  assert.equals(JSON.parse(response.payload).message, 'Could not parse request body as JSON')
})

test('json body: returns json if request is application/json', async (assert) => {
  const handler = async (context) => {
    return await context.body
  }
  handler.route = 'GET /'
  const server = await main({
    middleware: [],
    bodyParsers: [json],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
    headers: {
      'content-type': 'application/json',
    },
    payload: JSON.stringify({ hello: 'world' }),
  })

  assert.equals(response.statusCode, 200)
  assert.same(JSON.parse(response.payload), { hello: 'world' })
})

test('json body: accepts vendor json extensions', async (assert) => {
  const handler = async (context) => {
    return await context.body
  }
  handler.route = 'GET /'
  const server = await main({
    middleware: [],
    bodyParsers: [json],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
    headers: {
      'content-type': 'application/vnd.npm.corgi-v1+json',
    },
    payload: JSON.stringify({ hello: 'world' }),
  })

  assert.equals(response.statusCode, 200)
  assert.same(JSON.parse(response.payload), { hello: 'world' })
})

test('json body: accepts utf-8 json', async (assert) => {
  const handler = async (context) => {
    return await context.body
  }
  handler.route = 'GET /'
  const server = await main({
    middleware: [],
    bodyParsers: [json],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    payload: JSON.stringify({ hello: 'world' }),
  })

  assert.equals(response.statusCode, 200)
  assert.same(JSON.parse(response.payload), { hello: 'world' })
})

test('json body: skips any other json encoding', async (assert) => {
  const handler = async (context) => {
    return await context.body
  }
  handler.route = 'GET /'
  const server = await main({
    middleware: [],
    bodyParsers: [json],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
    headers: {
      'content-type': 'application/json; charset=wtf-8',
    },
    payload: JSON.stringify({ hello: 'world' }),
  })

  assert.equals(response.statusCode, 415)
})

test('urlEncoded body: returns 415 if request is not application/x-www-form-urlencoded', async (assert) => {
  const handler = async (context) => {
    await context.body
  }
  handler.route = 'GET /'
  const server = await main({
    middleware: [],
    bodyParsers: [urlEncoded],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })

  assert.equals(response.statusCode, 415)
  assert.equals(JSON.parse(response.payload).message, 'Cannot parse request body')
})

test('urlEncoded body: returns urlEncoded if request is application/x-www-form-urlencoded', async (assert) => {
  const handler = async (context) => {
    return await context.body
  }
  handler.route = 'GET /'
  const server = await main({
    middleware: [],
    bodyParsers: [urlEncoded],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    payload: querystring.stringify({ hello: 'world' }),
  })

  assert.equals(response.statusCode, 200)
  assert.same(JSON.parse(response.payload), { hello: 'world' })
})

test('body: custom body parsers on handler are used', async (assert) => {
  const handler = async (context) => {
    return await context.body
  }
  handler.route = 'GET /'
  handler.bodyParsers = [(next) => (request) => 'flooble']
  const server = await main({
    middleware: [],
    bodyParsers: [urlEncoded],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    payload: querystring.stringify({ hello: 'world' }),
  })

  assert.equals(response.statusCode, 200)
  assert.same(String(response.payload), 'flooble')
})

test('body: custom body parsers on handler do not effect other handlers', async (assert) => {
  const handler = async (context) => {
    return await context.body
  }
  handler.bodyParsers = [(next) => (request) => 'flooble']
  handler.route = 'GET /'
  const otherHandler = async (context) => {
    return await context.body
  }
  otherHandler.route = 'GET /other'
  const server = await main({
    middleware: [],
    bodyParsers: [urlEncoded],
    handlers: {
      handler,
      otherHandler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    payload: querystring.stringify({ hello: 'world' }),
  })

  assert.equals(response.statusCode, 200)
  assert.same(String(response.payload), 'flooble')

  const anotherResponse = await shot.inject(onrequest, {
    method: 'GET',
    url: '/other',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    payload: querystring.stringify({ hello: 'world' }),
  })

  assert.equals(anotherResponse.statusCode, 200)
  assert.same(JSON.parse(anotherResponse.payload), { hello: 'world' })
})

test('body: context.body can be set explicitly', async (assert) => {
  const handler = async (context) => {
    context.body = 'three ducks'
    return await context.body
  }
  handler.route = 'GET /'
  const otherHandler = async (context) => {
    return await context.body
  }
  otherHandler.route = 'GET /other'
  const server = await main({
    middleware: [],
    bodyParsers: [urlEncoded],
    handlers: {
      handler,
      otherHandler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    payload: querystring.stringify({ hello: 'world' }),
  })

  assert.equals(response.statusCode, 200)
  assert.same(String(response.payload), 'three ducks') // in THIS ECONOMY?!
})

test('jwt ignores requests without authorization header', async (assert) => {
  let called = 0
  const handler = await authenticateJWT({ publicKey: 'unused' })((context) => {
    ++called
    return 'ok'
  })

  const result = await handler({ headers: {} })

  assert.equal(called, 1)
  assert.equal(result, 'ok')
})

test('jwt ignores requests with authorization header that do not match configured scheme', async (assert) => {
  let called = 0
  const handler = await authenticateJWT({ publicKey: 'unused' })((context) => {
    ++called
    return 'ok'
  })

  const result = await handler({
    headers: {
      authorization: 'Boggle asfzxcdofj', // the Boggle-based authentication scheme
    },
  })

  assert.equal(called, 1)
  assert.equal(result, 'ok')
})

test('jwt validates and attaches payload for valid jwt headers', async (assert) => {
  const crypto = require('crypto')
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  })

  const jsonwebtoken = require('jsonwebtoken')
  const blob = await new Promise((resolve, reject) => {
    jsonwebtoken.sign(
      {
        ifItFits: 'iSits',
      },
      privateKey,
      {
        algorithm: 'RS256',
        noTimestamp: true,
      },
      (err, data) => (err ? reject(err) : resolve(data))
    )
  })

  let called = 0
  const handler = await authenticateJWT({ publicKey })((context) => {
    ++called
    return context.user
  })

  const result = await handler({
    headers: {
      authorization: `Bearer ${blob}`,
    },
  })

  assert.equal(called, 1)
  assert.same(result, { ifItFits: 'iSits' })
})

test('jwt throws a 403 for valid jwt token using incorrect algo', async (assert) => {
  const crypto = require('crypto')
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  })

  const jsonwebtoken = require('jsonwebtoken')
  const blob = await new Promise((resolve, reject) => {
    jsonwebtoken.sign(
      {
        ifItFits: 'iSits',
      },
      privateKey,
      {
        algorithm: 'HS256',
      },
      (err, data) => (err ? reject(err) : resolve(data))
    )
  })

  let called = 0
  const handler = await authenticateJWT({ publicKey })((context) => {
    ++called
    return context.user
  })

  try {
    await handler({
      headers: {
        authorization: 'Bearer banana', // WHO WOULDN'T WANT A BANANA, I ASK YOU
      },
    })
    assert.fail('expected failure, unexpected success. not cause for celebration')
  } catch (err) {
    assert.equal(called, 0)
    assert.equal(err[Symbol.for('status')], 403)
  }
})

test('jwt throws a 403 for invalid jwt headers', async (assert) => {
  let called = 0
  const handler = await authenticateJWT({ publicKey: 'unused' })((context) => {
    ++called
    return 'ok'
  })

  try {
    await handler({
      headers: {
        authorization: 'Bearer banana', // WHO WOULDN'T WANT A BANANA, I ASK YOU
      },
    })
    assert.fail('expected failure, unexpected success. not cause for celebration')
  } catch (err) {
    assert.equal(called, 0)
    assert.equal(err[Symbol.for('status')], 403)
  }
})

test('authenticateJWT() ensures `algorithms` is an array', async (assert) => {
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

test('log: logs expected keys', async (assert) => {
  const logged = []
  let handler = null
  const middleware = log({
    logger: {
      info(what) {
        logged.push(['info', what])
      },
      error(what) {
        logged.push(['error', what])
      },
    },
  })((context) => handler(context))

  handler = () => {
    return { [STATUS]: 202, result: 'ok' }
  }
  await middleware({
    request: {
      method: 'GET',
      url: '/bloo',
      headers: {},
    },
    start: 0,
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
    return Object.assign(new Error('foo'), { [THREW]: true })
  }
  await middleware({
    request: {
      method: 'GET',
      url: '/bloo',
      headers: {},
    },
    start: 0,
  })

  assert.equal(logged.length, 3)
  assert.equal(logged[1][0], 'error')
  assert.equal(logged[1][1].message, 'foo')
  assert.equal(logged[2][0], 'info')
})

test('validate.query decorator returns 400 on bad query param', async (assert) => {
  const decor = decorators.validate.query({
    type: 'object',
    required: ['param'],
    properties: {
      param: {
        type: 'string',
        format: 'email',
      },
    },
  })(() => {
    return 'ok'
  })

  const result = await decor({
    query: {},
  })

  assert.equal(result[STATUS], 400)
})

test('context.cookie contains the request cookies', async (assert) => {
  let called = 0
  const handler = async (context) => {
    ++called
    assert.same(context.cookie.get('foo'), {
      value: 'bar',
      secure: true,
      sameSite: true,
      httpOnly: true,
    })

    assert.same(context.cookie.get('hello'), {
      value: 'world',
      secure: true,
      sameSite: true,
      httpOnly: true,
    })
  }

  handler.route = 'GET /'
  const server = await main({
    middleware: [],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
    headers: {
      cookie: 'foo=bar; hello=world',
    },
  })

  assert.equals(response.statusCode, 204)
  assert.ok(!('set-cookie' in response.headers))
})

test('context.cookie.set creates cookies', async (assert) => {
  let called = 0
  const handler = async (context) => {
    ++called
    context.cookie.delete('foo')
    context.cookie.set('zu', 'bat')
    context.cookie.set('hello', {
      value: 'world',
      httpOnly: false,
    })
  }

  handler.route = 'GET /'
  const server = await main({
    middleware: [],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
    headers: {
      cookie: 'foo=bar; hello=world',
    },
  })

  const parsed = response.headers['set-cookie'].sort()

  assert.equal(parsed.length, 3)
  assert.matches(parsed[0], /foo=null; Max-Age=0; Expires=.* GMT; HttpOnly/)
  assert.matches(parsed[1], /hello=world; Secure; SameSite=Strict/)
  assert.matches(parsed[2], /zu=bat; HttpOnly; Secure; SameSite=Strict/)
})

test('template middleware intercepts template symbol responses', async (assert) => {
  let called = 0
  const handler = async (context) => {
    ++called
    return {
      [TEMPLATE]: 'test.html',
      greeting: 'hello',
    }
  }

  await fs.writeFile(
    path.join(__dirname, 'templates', 'test.html'),
    `
    {% raw %}{{ greeting }} world{% endraw %}
  `.trim()
  )

  handler.route = 'GET /'
  const server = await main({
    middleware: [template],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })

  assert.equal(called, 1)
  assert.equal(response.payload, 'hello world')
})

test('template middleware allows custom filters', async (assert) => {
  let called = 0
  const handler = async (context) => {
    ++called
    return {
      [TEMPLATE]: 'test.html',
      greeting: 'hello',
    }
  }

  await fs.writeFile(
    path.join(__dirname, 'templates', 'test.html'),
    `
    {% raw %}{{ greeting|frobnify }} world{% endraw %}
  `.trim()
  )

  handler.route = 'GET /'
  const server = await main({
    middleware: [
      [
        template,
        {
          filters: {
            // explicitly async to test our munging
            frobnify: async (xs) => xs + 'frob',
          },
        },
      ],
    ],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })

  assert.equal(called, 1)
  assert.equal(response.payload, 'hellofrob world')
})

test('template middleware allows custom tags', async (assert) => {
  let called = 0
  const handler = async (context) => {
    ++called
    return {
      [TEMPLATE]: 'test.html',
      greeting: 'hello',
    }
  }

  class FrobTag {
    tags = ['frob']
    parse(parser, nodes, lexer) {
      const tok = parser.nextToken()
      const args = parser.parseSignature(null, true)
      parser.advanceAfterBlockEnd(tok.value)
      const body = parser.parseUntilBlocks('endfrob')
      parser.advanceAfterBlockEnd()
      return new nodes.CallExtension(this, 'run', args, [body])
    }

    run(context, body) {
      return body().split(/\s+/).join('frob ') + 'frob'
    }
  }

  await fs.writeFile(
    path.join(__dirname, 'templates', 'test.html'),
    `
    {% raw %}{% frob %}{{ greeting }} world{% endfrob %}{% endraw %}
  `.trim()
  )

  handler.route = 'GET /'
  const server = await main({
    middleware: [
      [
        template,
        {
          tags: {
            frob: new FrobTag(),
          },
        },
      ],
    ],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })

  assert.equal(called, 1)
  assert.equal(response.payload, 'hellofrob worldfrob')
})

test('template middleware custom filters may throw', async (assert) => {
  let called = 0
  process.env.NODE_ENV = ''
  const handler = async (context) => {
    ++called
    return {
      [TEMPLATE]: 'test.html',
      greeting: 'hello',
    }
  }

  await fs.writeFile(
    path.join(__dirname, 'templates', 'test.html'),
    `
    {% raw %}{{ greeting|frobnify }} world{% endraw %}
  `.trim()
  )

  handler.route = 'GET /'
  const server = await main({
    middleware: [
      [
        template,
        {
          filters: {
            frobnify: (xs) => {
              throw new Error('oops oh no')
            },
          },
        },
      ],
    ],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })

  assert.equal(called, 1)
  assert.matches(response.payload, /oops oh no/)
})

test('reset env', async (_) => {
  process.env.NODE_ENV = 'test'
})

test('template errors are hidden in non-dev mode', async (assert) => {
  let called = 0
  const handler = async (context) => {
    ++called
    return {
      [TEMPLATE]: 'test.html',
      greeting: 'hello',
    }
  }

  await fs.writeFile(
    path.join(__dirname, 'templates', 'test.html'),
    `
    {% raw %}{{ greeting|frobnify }} world{% endraw %}
  `.trim()
  )

  handler.route = 'GET /'
  const server = await main({
    middleware: [
      [
        template,
        {
          filters: {
            frobnify: (xs) => {
              throw new Error('oops oh no')
            },
          },
        },
      ],
    ],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })

  assert.equal(called, 1)
  assert.notMatch(response.payload, /oops oh no/)
})

test('applyHeaders adds requested headers', async (assert) => {
  const handler = async (context) => {
    return 'woot'
  }

  handler.route = 'GET /'
  const server = await main({
    middleware: [[applyHeaders, { currency: 'zorkmid' }]],
    handlers: { handler },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })

  assert.equal(response.payload, 'woot')
  assert.equal(response.headers.currency, 'zorkmid')
})

test('applyXFO adds xfo header', async (assert) => {
  const handler = async (context) => {
    return 'woot'
  }

  handler.route = 'GET /'
  const server = await main({
    middleware: [[applyXFO, 'DENY']],
    handlers: {
      handler,
    },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })

  assert.equal(response.headers['x-frame-options'], 'DENY')
})

test('cookie signature check short-circuits on length check', async (assert) => {
  const check = checkCookieSignature('womp.signature', 'not-very-secret')
  assert.equal(check, false)
})

test('csrf middleware requires a signing secret', async (assert) => {
  let server, error
  let threw = false
  try {
    server = await main({
      middleware: [[applyCSRF, {}]],
      handlers: {},
    })
  } catch (ex) {
    threw = true
    error = ex
  }

  assert.ok(threw)
  assert.ok(/a secret for signing cookies/.test(error.message))
})

test('csrf middleware adds a token generator to the context', async (assert) => {
  let t
  const handler = async (context) => {
    assert.equal(typeof context.csrfToken, 'function')
    const t1 = context.csrfToken()
    const t2 = context.csrfToken()
    assert.equal(t1, t2)
    return t1
  }

  handler.route = 'GET /'
  const server = await main({
    middleware: [[applyCSRF, { cookieSecret: 'not-very-secret' }]],
    handlers: { handler },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })
  assert.equal(response.statusCode, 200)
  assert.equal(typeof response.payload, 'string')
})

test('the token generator allows you to force a fresh token', async (assert) => {
  let t
  const handler = async (context) => {
    const t1 = context.csrfToken()
    const t2 = context.csrfToken({ refresh: true })
    const t3 = context.csrfToken({ refresh: false })
    assert.notEqual(t1, t2)
    assert.equal(t2, t3)
    return 'my tokens are fresh'
  }

  handler.route = 'GET /'
  const server = await main({
    middleware: [[applyCSRF, { cookieSecret: 'not-very-secret' }]],
    handlers: { handler },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })
  assert.equal(response.statusCode, 200)
  assert.equal(response.payload, 'my tokens are fresh')
})

test('csrf middleware enforces presence of token on mutations', async (assert) => {
  let called = 0
  const handler = async (context) => {
    called++
    return 'no tokens at all'
  }

  handler.route = 'PUT /'
  const server = await main({
    middleware: [[applyCSRF, { cookieSecret: 'not-very-secret' }]],
    handlers: { handler },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'PUT',
    url: '/',
    payload: { text: 'I am quite tokenless.' },
  })

  assert.equal(response.statusCode, 403)
  assert.ok(/Invalid CSRF token/.test(response.payload))
  assert.equal(called, 0)
})

test('csrf middleware accepts valid token in body', async (assert) => {
  const _c = require('cookie')

  let called = 0
  const handler = async (context) => {
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
    middleware: [[applyCSRF, { cookieSecret }]],
    handlers: { handler },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'PUT',
    url: '/',
    headers: { cookie: _c.serialize('_csrf', signedUserSecret) },
    payload: { _csrf: token },
  })

  assert.equal(called, 1)
  assert.equal(response.statusCode, 200)
  assert.equal(response.payload, 'my token is good')
})

test('csrf middleware accepts valid token in headers', async (assert) => {
  const _c = require('cookie')

  let called = 0
  const handler = async (context) => {
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
    middleware: [[applyCSRF, { cookieSecret, header: 'my-header' }]],
    handlers: { handler },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'PUT',
    url: '/',
    headers: {
      cookie: _c.serialize('_csrf', signedUserSecret),
      'my-header': token,
    },
    payload: {},
  })

  assert.equal(called, 1)
  assert.equal(response.statusCode, 200)
  assert.equal(response.payload, 'my header token is good')
})

test('csrf middleware rejects bad tokens', async (assert) => {
  const _c = require('cookie')

  let called = 0
  const handler = async (context) => {
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
    middleware: [[applyCSRF, { cookieSecret }]],
    handlers: { handler },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'PUT',
    url: '/',
    headers: { cookie: _c.serialize('_csrf', signedUserSecret) },
    payload: { _csrf: 'bad-token-dudes' },
  })

  assert.equal(response.statusCode, 403)
  assert.ok(/Invalid CSRF token/.test(response.payload))
  assert.equal(called, 0)
})

test('csrf middleware ignores secrets with bad signatures', async (assert) => {
  const _c = require('cookie')

  let called = 0
  const handler = async (context) => {
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
    middleware: [[applyCSRF, { cookieSecret }]],
    handlers: { handler },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'PUT',
    url: '/',
    headers: { cookie: _c.serialize('_csrf', signedUserSecret) },
    payload: { _csrf: 'bad-token-dudes' },
  })

  assert.equal(response.statusCode, 403)
  assert.ok(/Invalid CSRF token/.test(response.payload))
  assert.equal(called, 0)
})

test('session middleware throws on malformed session data', async (assert) => {
  const _c = require('cookie')
  const _iron = require('@hapi/iron')

  const config = {
    secret: 'wow a great secret, just amazing wootles'.repeat(2),
    salt: 'potassium',
  }
  const handler = async (context) => {
    const s = await context.session
    return 'OK'
  }
  handler.route = 'GET /'
  const server = await main({
    middleware: [[session, config]],
    handlers: { handler },
  })

  const baddata = await _iron.seal('I-am-malformed', config.secret, { ..._iron.defaults })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
    headers: { cookie: _c.serialize('sid', baddata) },
  })
  assert.equal(response.statusCode, 400)
})

test('vary middleware: accepts single values', async (assert) => {
  const handler = async (context) => {
    return 'ok'
  }

  handler.route = 'GET /'
  const server = await main({
    middleware: [[vary, 'frobs']],
    handlers: { handler },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })

  assert.equal(response.statusCode, 200)
  assert.same(response.headers.vary, ['frobs'])
})

test('vary middleware: accepts multiple values', async (assert) => {
  const handler = async (context) => {
    return 'ok'
  }

  handler.route = 'GET /'
  const server = await main({
    middleware: [[vary, ['frobs', 'cogs']]],
    handlers: { handler },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })

  assert.equal(response.statusCode, 200)
  assert.same(response.headers.vary, ['frobs', 'cogs'])
})

test('vary middleware: may be repeated', async (assert) => {
  const handler = async (context) => {
    return 'ok'
  }

  handler.route = 'GET /'
  const server = await main({
    middleware: [
      [vary, ['frobs', 'cogs']],
      [vary, 'frobs'],
    ],
    handlers: { handler },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })

  assert.equal(response.statusCode, 200)
  assert.same(response.headers.vary, ['frobs', 'frobs', 'cogs'])
})

test('vary middleware: applies to errors', async (assert) => {
  const handler = async (context) => {
    throw new Error()
  }

  handler.route = 'GET /'
  const server = await main({
    middleware: [[vary, 'sprockets']],
    handlers: { handler },
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'GET',
    url: '/',
  })

  assert.equal(response.statusCode, 500)
  assert.same(response.headers.vary, ['sprockets'])
})

test('applyXFO() ensures its option is DENY or SAMEORIGIN', async (assert) => {
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

test('template() ensures `paths` is an array', async (assert) => {
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

test('validate.body: invalid input', async (assert) => {
  let called = 0
  const handler = async (context) => {
    ++called
    await context.body
    ++called
  }

  handler.route = 'POST /'
  handler.middleware = [
    [
      middleware.validate.body,
      {
        type: 'object',
        properties: {
          foo: { type: 'string', minLength: 1 },
          bar: { type: 'boolean' },
        },
        required: ['bar'],
      },
    ],
  ]

  const server = await main({
    handlers: { handler },
    middleware: [],
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    method: 'POST',
    url: '/',
    payload: {
      foo: '',
    },
  })

  assert.equal(response.statusCode, 400)
  assert.equal(called, 1)
  assert.same(JSON.parse(response.payload), {
    message: 'Bad request',
    errors: [
      {
        instancePath: '',
        schemaPath: '#/required',
        keyword: 'required',
        params: {
          missingProperty: 'bar',
        },
        message: "must have required property 'bar'",
      },
      {
        keyword: 'minLength',
        instancePath: '/foo',
        schemaPath: '#/properties/foo/minLength',
        params: {
          limit: 1,
        },
        message: 'must NOT have fewer than 1 characters',
      },
    ],
  })
})

test('validate.query: invalid input', async (assert) => {
  let called = 0
  const handler = async (context) => {
    ++called
  }

  handler.route = 'GET /'
  handler.middleware = [
    [
      middleware.validate.query,
      {
        type: 'object',
        properties: {
          bar: { type: 'boolean' },
        },
        required: ['bar'],
      },
    ],
  ]

  const server = await main({
    handlers: { handler },
    middleware: [],
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    url: '/',
  })
  assert.equal(response.statusCode, 400)
  assert.equal(called, 0)
  assert.same(JSON.parse(response.payload), {
    message: 'Bad request',
    errors: [
      {
        keyword: 'required',
        instancePath: '',
        schemaPath: '#/required',
        params: {
          missingProperty: 'bar',
        },
        message: "must have required property 'bar'",
      },
    ],
  })
})

test('validate.params: invalid input', async (assert) => {
  let called = 0
  const handler = async (context) => {
    ++called
  }

  handler.route = 'GET /:parm'
  handler.middleware = [
    [
      middleware.validate.params,
      {
        type: 'object',
        properties: {
          parm: { type: 'string', pattern: '^esan$' },
        },
        required: ['parm'],
      },
    ],
  ]

  const server = await main({
    handlers: { handler },
    middleware: [],
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    url: '/gouda',
  })
  assert.equal(response.statusCode, 400)
  assert.equal(called, 0)
  assert.same(JSON.parse(response.payload), {
    message: 'Bad request',
    errors: [
      {
        keyword: 'pattern',
        instancePath: '/parm',
        schemaPath: '#/properties/parm/pattern',
        params: {
          pattern: '^esan$',
        },
        message: 'must match pattern "^esan$"',
      },
    ],
  })
})

test('validate.query: using defaults', async (assert) => {
  let called = 0
  const handler = async (context) => {
    return context.query.bar || 'ohno'
  }

  handler.route = 'GET /'
  handler.middleware = [
    [
      middleware.validate.query,
      {
        type: 'object',
        properties: {
          bar: { type: 'string', default: 'aw heck' },
        },
      },
    ],
  ]

  const server = await main({
    handlers: { handler },
    middleware: [],
  })

  const [onrequest] = server.listeners('request')
  const response = await shot.inject(onrequest, {
    url: '/',
  })
  assert.equal(response.statusCode, 200)
  assert.same(response.payload, 'aw heck')
})
