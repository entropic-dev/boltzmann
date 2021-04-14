// {% if selftest %}
import {STATUS} from '../core/prelude'
// {% endif %}

/* {% if selftest %} */export /* {% endif %} */class BadSessionError extends Error {
  [STATUS]: number = 400
}

/* {% if selftest %} */export /* {% endif %} */class NoMatchError extends Error {
  [STATUS]: number = 404
  public __noMatch: boolean = true

  constructor(method: string, pathname: string) {
    super(`Could not find route for ${method} ${pathname}`)
    Error.captureStackTrace(this, NoMatchError)
  }
}
