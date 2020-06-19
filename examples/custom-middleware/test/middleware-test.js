'use strict'

const tap = require('tap')

const attachFlappingClient = require('../middleware/attach-flapping-client')
const { decorators: { test: testDecorator } } = require('../boltzmann')
const attachClient = require('../middleware/attach-client')
const gzip = require('../middleware/gzip')

tap.test('attachClient attaches the client as expected', async assert => {
  const acceptor = attachClient({ url: 'https://example.com/' })

  let sawMyClient = false
  const handler = acceptor(context => {
    sawMyClient = true
    assert.ok('myClient' in context)
    assert.equal(context.myClient.defaults.baseURL, 'https://example.com/')
    return 'ok then'
  })

  const result = await handler({})
  assert.equal(result, 'ok then')
  assert.ok(sawMyClient)
})

tap.test('attachFlappingClient rejects acceptor on backing service timeout', async assert => {
  const net = require('net')

  const server = net.createServer().listen(8124)

  try {
    const acceptor = attachFlappingClient({ url: 'http://localhost:8124/', timeout: 10 })
    await acceptor(() => {})
    assert.fail('expected the service to fail')
  } catch (err) {
    assert.equal(err.code, 'ECONNABORTED')
  } finally {
    server.close()
  }
})

tap.test('attachFlappingClient rejects acceptor on backing service non-2xx response', async assert => {
  const http = require('http')

  const server = http.createServer((_req, res) => {
    res.writeHead(404)
    res.end()
  }).listen(8124)

  try {
    const acceptor = attachFlappingClient({ url: 'http://localhost:8124/', timeout: 100 })
    await acceptor(() => {})
    assert.fail('expected the service to fail')
  } catch (err) {
    assert.matches(err.message, 'Bing didn\'t respond')
  } finally {
    server.close()
  }
})

tap.test('attachFlappingClient attaches client as expected', async assert => {
  const http = require('http')

  const server = http.createServer((_req, res) => {
    res.writeHead(200)
    res.end()
  }).listen(8124)

  try {
    const acceptor = attachFlappingClient({ url: 'http://localhost:8124/' })

    let sawMyClient = false
    const handler = await acceptor(context => {
      sawMyClient = true
      assert.ok('myFlappingClient' in context)
      assert.equal(context.myFlappingClient.defaults.baseURL, 'http://localhost:8124/')
      return 'ok then'
    })

    const result = await handler({})
    assert.equal(result, 'ok then')
    assert.ok(sawMyClient)
  } finally {
    server.close()
  }
})

let response = null
const _ = testDecorator({
  middleware: [
    gzip,
    () => _next => _context => response
  ]
})

tap.test('gzip middleware ignores requests that do not accept gzip encoded responses', _(async assert => {
  response = 'hello world'

  const res = await assert.request({
    url: '/foo',
    headers: { 'accept-encoding': 'brotli' }
  })

  assert.same(res.headers['content-encoding'], null)
}))

tap.test('gzip middleware ignores empty responses', _(async assert => {
  response = ''

  const res = await assert.request({
    url: '/foo',
    headers: { 'accept-encoding': 'gzip' }
  })

  assert.same(res.headers['content-encoding'], null)
}))

tap.test('gzip middleware forwards status codes and headers', _(async assert => {
  response = {
    message: 'wow what a message',
    [Symbol.for('status')]: 203,
    [Symbol.for('headers')]: { 'x-wow-factor': 'dazzling' }
  }

  const res = await assert.request({
    url: '/foo',
    headers: { 'accept-encoding': 'gzip' }
  })

  assert.equal(res.headers['content-encoding'], 'gzip')
  assert.equal(res.headers['x-wow-factor'], 'dazzling')
  assert.equal(res.statusCode, 203)
}))

tap.test('gzip middleware works on streams', _(async assert => {
  const { Readable } = require('stream')

  response = new Readable({
    read (_n) {
      this.push('ok then')
      this.push(null)
      this._read = () => {}
    }
  })
  response[Symbol.for('status')] = 203

  const res = await assert.request({
    url: '/foo',
    headers: { 'accept-encoding': 'gzip' }
  })

  const zlib = require('zlib')


  assert.equal(res.headers['content-encoding'], 'gzip')
  assert.equal(String(zlib.gunzipSync(res.rawPayload)), 'ok then')
  assert.equal(res.statusCode, 203)
}))

tap.test('gzip middleware works on buffers', _(async assert => {
  response = Buffer.from('ok then')
  response[Symbol.for('status')] = 203

  const res = await assert.request({
    url: '/foo',
    headers: { 'accept-encoding': 'gzip' }
  })

  const zlib = require('zlib')


  assert.equal(res.headers['content-encoding'], 'gzip')
  assert.equal(String(zlib.gunzipSync(res.rawPayload)), 'ok then')
  assert.equal(res.statusCode, 203)
}))

tap.test('gzip middleware works on objects', _(async assert => {
  response = { "ok": "then" }
  response[Symbol.for('status')] = 203

  const res = await assert.request({
    url: '/foo',
    headers: { 'accept-encoding': 'gzip' }
  })

  const zlib = require('zlib')

  assert.equal(res.headers['content-encoding'], 'gzip')
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  assert.equal(String(zlib.gunzipSync(res.rawPayload)), '{"ok":"then"}')
  assert.equal(res.statusCode, 203)
}))
