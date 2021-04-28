void `{% if selftest %}`;
export { dev }

import { Handler } from '../core/middleware'
import { Context } from '../data/context'
void `{% endif %}`;

const hangWarning: unique symbol = Symbol('hang-stall')
const hangError: unique symbol  = Symbol('hang-error')

function dev(
  nextName?: string,
  warnAt = Number(process.env.DEV_LATENCY_WARNING_MS) || 500,
  errorAt = Number(process.env.DEV_LATENCY_ERROR_MS) || 2000
) {
  return function devMiddleware (next: Handler) {
    return async function inner(context: Context) {
      const req = context.request
      if (context[hangWarning as any]) {
        clearTimeout(context[hangWarning as any])
      }
      context[hangWarning as any] = setTimeout(() => {
        console.error(
          `⚠️ Response from ${nextName} > ${warnAt}ms fetching "${req.method} ${
            req.url
          }".`
        )
        console.error(
          '\x1b[037m - (Tune timeout using DEV_LATENCY_WARNING_MS env variable.)\x1b[00m'
        )
      }, warnAt)

      if (context[hangError as any]) {
        clearTimeout(context[hangError as any])
      }
      context[hangError as any] = setTimeout(() => {
        console.error(
          `🛑 STALL: Response from ${nextName} > ${errorAt}ms: "${req.method} ${
            req.url
          }". (Tune timeout using DEV_LATENCY_ERROR_MS env variable.)`
        )
        console.error(
          '\x1b[037m - (Tune timeout using DEV_LATENCY_ERROR_MS env variable.)\x1b[00m'
        )
      }, errorAt)

      const result = await next(context)
      clearTimeout(context[hangWarning as any])
      context[hangWarning as any] = null
      clearTimeout(context[hangError as any])
      context[hangError as any] = null
      return result
    }
  }
}

void `{% if selftest %}`;
import tap from 'tap'
/* c8 ignore next */
if (require.main === module) {
  const { test } = tap

  test('dev: warns after DEV_LATENCY_WARNING_MS', async (assert) => {
    process.env.DEV_LATENCY_WARNING_MS = '1'
    const { error } = console
    const acc: string[] = []
    console.error = acc.push.bind(acc)

    const adaptor = dev('example name')
    const handler = adaptor(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
    })

    const response = await handler(<any>{ request: {} })
    assert.equal(response, undefined)
    assert.equal(acc.length, 2)
    assert.match(acc[0], /Response from example name > 1ms fetching/)
    assert.match(acc[1], /Tune timeout using DEV_LATENCY_WARNING_MS env variable/)
  })

  test('dev: only warns once', async (assert) => {
    process.env.DEV_LATENCY_WARNING_MS = '1'
    const { error } = console
    const acc: string[] = []
    console.error = acc.push.bind(acc)

    const adaptor = dev('example name')
    const handler = adaptor(dev('another')(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
    }))

    const response = await handler(<any>{ request: {} })
    assert.equal(response, undefined)
    assert.equal(acc.length, 2)
    assert.match(acc[0], /Response from another > 1ms fetching/)
    assert.match(acc[1], /Tune timeout using DEV_LATENCY_WARNING_MS env variable/)
  })

  test('dev: warns after DEV_LATENCY_ERROR_MS', async (assert) => {
    process.env.DEV_LATENCY_WARNING_MS = '1000'
    process.env.DEV_LATENCY_ERROR_MS = '1'
    const { error } = console
    const acc: string[] = []
    console.error = acc.push.bind(acc)

    const adaptor = dev('example name')
    const handler = adaptor(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
    })

    const response = await handler(<any>{ request: {} })
    assert.equal(response, undefined)
    assert.equal(acc.length, 2)
    assert.match(acc[0], /STALL: Response from example name > 1ms/)
    assert.match(acc[1], /Tune timeout using DEV_LATENCY_ERROR_MS env variable/)
  })

  test('dev: only warns once', async (assert) => {
    process.env.DEV_LATENCY_WARNING_MS = '1000'
    process.env.DEV_LATENCY_ERROR_MS = '1'
    const { error } = console
    const acc: string[] = []
    console.error = acc.push.bind(acc)

    const adaptor = dev('example name')
    const handler = adaptor(dev('another')(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
    }))

    const response = await handler(<any>{ request: {} })
    assert.equal(response, undefined)
    assert.equal(acc.length, 2)
    assert.match(acc[0], /STALL: Response from another > 1ms/)
    assert.match(acc[1], /Tune timeout using DEV_LATENCY_ERROR_MS env variable/)
  })
}
void `{% endif %}`;
