// {% if selftest %}
import {STATUS} from '../core/prelude'

export { BadSessionError, NoMatchError }
// {% endif %}

class BadSessionError extends Error {
  [STATUS]: number = 400
}

class NoMatchError extends Error {
  [STATUS]: number = 404
  public __noMatch: boolean = true

  constructor(method: string, pathname: string) {
    super(`Could not find route for ${method} ${pathname}`)
    Error.captureStackTrace(this, NoMatchError)
  }
}
