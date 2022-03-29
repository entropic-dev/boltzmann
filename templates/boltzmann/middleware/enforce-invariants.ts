void `{% if selftest %}`;
export { enforceInvariants }

import { STATUS, HEADERS, TEMPLATE, THREW } from '../core/prelude'
import { Handler } from '../core/middleware'
import { Context } from '../data/context'
void `{% endif %}`;

function enforceInvariants () {
  return function invariantMiddleware (next: Handler) {
    // the "...args" here are load-bearing: this is applied between
    // decorators _and_ middleware
    return async function invariant (ctx: Context) {
      let error: any
      let result

      try {
        result = await next(ctx)
      } catch (err) {
        error = err
      }

      const body = error || result || ''
      const isPipe = body && body.pipe

      const {
        [STATUS]: status = error ? 500 : result ? 200 : 204,
        [HEADERS]: headers = {},
      } = body || {}

      if (!headers['content-type']) {
        if (typeof body === 'string') {
          headers['content-type'] = 'text/plain; charset=utf-8'
        } else if (isPipe) {
          headers['content-type'] = 'application/octet-stream'
        } else {
          // {% if templates %}
          if (body && body[TEMPLATE]) {
            headers['content-type'] = 'text/html; charset=utf-8'
          } else {
            headers['content-type'] = 'application/json; charset=utf-8'
          }
          // {% else %}
          headers['content-type'] = 'application/json; charset=utf-8'
          // {% endif %}
        }
      }

      if (error) {
        error[STATUS] = status
        error[HEADERS] = headers
        error[THREW] = true
        return error
      }

      if (result && typeof result === 'object') {
        result[STATUS] = status
        result[HEADERS] = headers
        return result
      }

      if (!result) {
        result = ''
      }

      const stream = Buffer.from(String(result), 'utf8')
      stream[STATUS as any] = status
      stream[HEADERS as any] = headers
      return stream
    }
  }
}

