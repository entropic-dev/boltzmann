// {% if selftest %}
import isDev from 'are-we-dev'

import { BodyParser, BodyInput } from '../core/body'
import {STATUS} from '../core/prelude'
import { _collect } from '../utils'
// {% endif %}

/* {% if selftest %} */export /* {% endif %} */function json (next: BodyParser) {
  return async (request: BodyInput) => {
    if (
      request.contentType.type === 'application' &&
      request.contentType.subtype === 'json' &&
      request.contentType.charset === 'utf-8'
    ) {
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

/* {% if selftest %} */
import tap from 'tap'
import {Context} from '../data/context'
import {main} from '../bin/runserver'
import {inject} from '@hapi/shot'
/* istanbul ignore next */
{
  const { test } = tap

  test('json body: returns 415 if request is not application/json', async (assert) => {
    const handler = async (context: Context) => {
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
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })

    assert.equal(response.statusCode, 415)
    assert.equal(JSON.parse(response.payload).message, 'Cannot parse request body')
  })

  test('json body: returns 422 if request is application/json but contains bad json', async (assert) => {
    const handler = async (context: Context) => {
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
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
      headers: {
        'content-type': 'application/json',
      },
      payload: 'dont call me json',
    })

    assert.equal(response.statusCode, 422)
    assert.equal(JSON.parse(response.payload).message, 'Could not parse request body as JSON')
  })

  test('json body: returns json if request is application/json', async (assert) => {
    const handler = async (context: Context) => {
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
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
      headers: {
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ hello: 'world' }),
    })

    assert.equal(response.statusCode, 200)
    assert.same(JSON.parse(response.payload), { hello: 'world' })
  })

  test('json body: accepts vendor json extensions', async (assert) => {
    const handler = async (context: Context) => {
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
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
      headers: {
        'content-type': 'application/vnd.npm.corgi-v1+json',
      },
      payload: JSON.stringify({ hello: 'world' }),
    })

    assert.equal(response.statusCode, 200)
    assert.same(JSON.parse(response.payload), { hello: 'world' })
  })

  test('json body: accepts utf-8 json', async (assert) => {
    const handler = async (context: Context) => {
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
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      payload: JSON.stringify({ hello: 'world' }),
    })

    assert.equal(response.statusCode, 200)
    assert.same(JSON.parse(response.payload), { hello: 'world' })
  })

  test('json body: skips any other json encoding', async (assert) => {
    const handler = async (context: Context) => {
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
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
      headers: {
        'content-type': 'application/json; charset=wtf-8',
      },
      payload: JSON.stringify({ hello: 'world' }),
    })

    assert.equal(response.statusCode, 415)
  })
}
/* {% endif %} */
