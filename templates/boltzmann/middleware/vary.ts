// {% if selftest %}
import { Handler } from '../core/middleware'
import { Context } from '../data/context'

const HEADERS = Symbol.for('headers')
// {% endif %}

/* {% if selftest %} */export /* {% endif %} */function vary (on: string[] | string = []) {
  const headers = [].concat(<any>on) as string[]

  return (next: Handler) => {
    return async (context: Context) => {
      const response = await next(context)
      response[HEADERS].vary = [].concat(response[HEADERS].vary || [], <any>headers)
      return response
    }
  }
}

/* {% if selftest %} */
import tap from 'tap'
import {main} from '../bin/runserver'
import {inject} from '@hapi/shot'
{
  const { test } = tap

  test('vary middleware: accepts single values', async (assert) => {
    const handler = async () => {
      return 'ok'
    }

    handler.route = 'GET /'
    const server = await main({
      middleware: [[vary, 'frobs']],
      handlers: { handler },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })

    assert.equal(response.statusCode, 200)
    assert.same(response.headers.vary, ['frobs'])
  })

  test('vary middleware: accepts multiple values', async (assert) => {
    const handler = async () => {
      return 'ok'
    }

    handler.route = 'GET /'
    const server = await main({
      middleware: [[vary, ['frobs', 'cogs']]],
      handlers: { handler },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })

    assert.equal(response.statusCode, 200)
    assert.same(response.headers.vary, ['frobs', 'cogs'])
  })

  test('vary middleware: may be repeated', async (assert) => {
    const handler = async () => {
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
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })

    assert.equal(response.statusCode, 200)
    assert.same(response.headers.vary, ['frobs', 'frobs', 'cogs'])
  })

  test('vary middleware: applies to errors', async (assert) => {
    const handler = async () => {
      throw new Error()
    }

    handler.route = 'GET /'
    const server = await main({
      middleware: [[vary, 'sprockets']],
      handlers: { handler },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })

    assert.equal(response.statusCode, 500)
    assert.same(response.headers.vary, ['sprockets'])
  })
}
/* {% endif %} */
