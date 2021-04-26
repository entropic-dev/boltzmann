void `{% if selftest %}`;
export { handleCORS }

import { HTTPMethod } from 'find-my-way'
import isDev from 'are-we-dev'

import { Handler } from '../core/middleware'
import { Context } from '../data/context'
void `{% endif %}`;

/**{{- tsdoc(page="03-middleware.md", section="handlecors") -}}*/
function handleCORS ({
  origins = isDev() ? '*' : String(process.env.CORS_ALLOW_ORIGINS || '').split(','),
  methods = String(process.env.CORS_ALLOW_METHODS || '').split(',') as HTTPMethod[],
  headers = String(process.env.CORS_ALLOW_HEADERS || '').split(',')
}: {
  origins?: string[] | string,
  methods?: HTTPMethod[] | HTTPMethod,
  headers?: string[] | string
}) {
  const originsArray = Array.isArray(origins) ? origins : [origins]
  const includesStar = originsArray.includes('*')

  return (next: Handler) => {
    return async function cors (context: Context) {
      if (!includesStar && !originsArray.includes(String(context.headers.origin))) {
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
        'Access-Control-Allow-Methods': ([] as any[]).concat(methods).join(','),
        'Access-Control-Allow-Headers': ([] as any[]).concat(headers).join(',')
      }

      return response
    }
  }
}

void `{% if selftest %}`;
import tap from 'tap'
/* c8 ignore next */
if (require.main === module) {
  const { test } = tap

  test('handleCORS: returns 400 when origin is not included in allow list', async (assert) => {
    const adaptor = handleCORS({ origins: ['foo.com'] })
    const handler = adaptor(() => {})

    const response = handler(<any>{ headers: { 'origin': 'bar.com' }})
    assert.rejects(response, 'Origin not allowed')
    const err = await response.catch(err => err)

    assert.equal(err[Symbol.for('status')], 400)
  })

  test('handleCORS: returns 204 response for any OPTIONS request', async (assert) => {
    const adaptor = handleCORS({ origins: ['foo.com'] })
    const handler = adaptor(() => {})

    const response = await handler(<any>{ method: 'OPTIONS', headers: { 'origin': 'foo.com' }})
    assert.equal(response[Symbol.for('status')], 204)
    assert.same(response[Symbol.for('headers')], {
      'Access-Control-Allow-Origin': 'foo.com',
      'Access-Control-Allow-Methods': '',
      'Access-Control-Allow-Headers': ''
    })
  })

  test('handleCORS: decorates inner response for any non-OPTIONS request', async (assert) => {
    const expected = {}
    const adaptor = handleCORS({ origins: ['foo.com'] })
    const handler = adaptor(() => expected)

    const response = await handler(<any>{ method: 'GET', headers: { 'origin': 'foo.com' }})
    assert.equal(response[Symbol.for('status')], undefined)
    assert.same(response[Symbol.for('headers')], {
      'Access-Control-Allow-Origin': 'foo.com',
      'Access-Control-Allow-Methods': '',
      'Access-Control-Allow-Headers': ''
    })
    assert.equal(expected, response)
  })
}
void `{% endif %}`;
