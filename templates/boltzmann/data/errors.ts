void `{% if selftest %}`;
import {STATUS} from '../core/prelude'
void `{% endif %}`;

class BadSessionError extends Error {
  // {# CD: don't use default values on computed symbol props. #}
  // {# typescript transpiles them poorly. #}
  [STATUS]: number
  constructor () {
    super("Invalid session cookie")
    this[STATUS] = 400
  }
}

class NoMatchError extends Error {
  // {# CD: don't use default values on computed symbol props. #}
  // {# typescript transpiles them poorly. #}
  [STATUS]: number
  public __noMatch: boolean = true

  constructor(method: string, pathname: string) {
    super(`Could not find route for ${method} ${pathname}`)
    this[STATUS] = 404
    Error.captureStackTrace(this, NoMatchError)
  }
}

void `{% if selftest %}`;
// moving the exports down here so the JS compilation doesn't complain
// about referencing the classes before their definition.
export { BadSessionError, NoMatchError }
void `{% endif %}`;
