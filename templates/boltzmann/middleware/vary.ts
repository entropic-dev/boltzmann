void `{% if selftest %}`;
import { Handler } from '../core/middleware'
import { Context } from '../data/context'
import { HEADERS } from '../core/prelude'

export { vary }
void `{% endif %}`;

/**{{- tsdoc(page="03-middleware.md", section="vary") -}}*/
function vary (on: string[] | string = []) {
  const headers = [].concat(<any>on) as string[]

  return (next: Handler) => {
    return async (context: Context) => {
      const response = await next(context)
      response[HEADERS].vary = [].concat(response[HEADERS].vary || [], <any>headers)
      return response
    }
  }
}

void `{% if selftest %}`;
import tap from 'tap'
import {runserver} from '../bin/runserver'
import {inject} from '@hapi/shot'
/* istanbul ignore next */
if (require.main === module) {
  const { test } = tap

  test('vary middleware: accepts single values', async (assert) => {
    const handler = async () => {
      return 'ok'
    }

    handler.route = 'GET /'
    const server = await runserver({
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
    const server = await runserver({
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
    const server = await runserver({
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
    const server = await runserver({
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
void `{% endif %}`;
