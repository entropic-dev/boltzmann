// {% if selftest %}
import { Handler } from '../core/middleware'
import { Context } from '../data/context'
// {% endif %}

const hangWarning: unique symbol = Symbol('hang-stall')
const hangError: unique symbol  = Symbol('hang-error')

/* {% if selftest %} */export /* {% endif %} */function dev(
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
