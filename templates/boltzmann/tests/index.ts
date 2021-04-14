// tbh, I'd like to move each of these tests into the files themselves.
import {inject} from '@hapi/shot'
import {createReadStream, promises as fs} from 'fs'
import path from 'path'
import tap from 'tap'
import {main} from '../bin/runserver'
import {Context} from '../data/context'
import {template} from '../middleware/template'
import {_requireOr} from '../utils'

const { test } = tap

test('decorators forward their args', async (assert) => {
  let called = null
  const handler = (context: Context, params) => {
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
  const response = await inject(<any>onrequest, {
    method: 'GET',
    url: '/hello/world',
  })

  assert.same(called, {
    foo: 'hello',
    bar: 'world',
  })
  assert.equal(response.statusCode, 204)
  assert.same(response.payload, '')
})

