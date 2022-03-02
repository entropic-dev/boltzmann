void `{% if selftest %}`;
export { handleCORS }

import { beeline, honeycomb, otel } from '../core/honeycomb'
import { HTTPMethod } from 'find-my-way'
import isDev from 'are-we-dev'

import { Handler } from '../core/middleware'
import { Context } from '../data/context'
void `{% endif %}`;

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
      const reflectedOrigin = (
        includesStar
        ? '*'
        : (
          originsArray.includes(String(context.headers.origin))
          ? context.headers.origin
          : false
        )
      )
      const spanAttributes = {
        'boltzmann.http.origin': String(context.headers.origin)
      }
      if (honeycomb.features.beeline) {
        beeline.addContext(spanAttributes)
      }
      const span = otel.trace.getSpan(otel.context.active())
      if (span) {
        span.setAttributes(spanAttributes)
      }

      const response = (
        context.method === 'OPTIONS'
        ? Object.assign(Buffer.from(''), {
            [Symbol.for('status')]: 204,
          })
        : await next(context)
      )

      response[Symbol.for('headers')] = {
        ...(reflectedOrigin ? { 'Access-Control-Allow-Origin': reflectedOrigin } : {}),
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
