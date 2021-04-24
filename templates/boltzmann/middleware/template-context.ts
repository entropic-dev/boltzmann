// {% if selftest %}
import { Handler } from '../core/middleware'
import { Context } from '../data/context'

export { templateContext }
// {% endif %}

/**{{- tsdoc(page="03-middleware.md", section="templatecontext") -}}*/
function templateContext(extraContext: Record<string, unknown> = {}) {
  return (next: Handler) => {
    return async (context: Context) => {
      const result = await next(context)

      if (Symbol.for('template') in result) {
        result.STATIC_URL = process.env.STATIC_URL || '/static'

        for (const [key, fn] of Object.entries(extraContext)) {
          result[key] = typeof fn === 'function' ? await fn(context) : fn
        }
      }

      return result
    }
  }
}
