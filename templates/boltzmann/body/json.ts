// {% if selftest %}
import isDev from 'are-we-dev'

import { BodyParser, BodyInput } from '../core/body'
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
