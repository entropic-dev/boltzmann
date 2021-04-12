// {% if selftest %}
import querystring from 'querystring'

import { BodyParser, BodyInput } from '../core/body'
import { _collect } from '../utils'
// {% endif %}

/* {% if selftest %} */export /* {% endif %} */function urlEncoded (next: BodyParser) {
  return async (request: BodyInput) => {
    if (
      request.contentType.type !== 'application' ||
      request.contentType.subtype !== 'x-www-form-urlencoded' ||
      request.contentType.charset !== 'utf-8'
    ) {
      return next(request)
    }

    const buf = await _collect(request)
    // XXX: AFAICT there's no way to get the querystring parser to throw, hence
    // the lack of a try/catch here.
    return querystring.parse(String(buf))
  }
}
