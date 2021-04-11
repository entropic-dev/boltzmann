// {% if selftest %}
import { Handler } from '../core/middleware'
import { Context } from '../data/context'

const HEADERS = Symbol.for('headers')
// {% endif %}

/* {% if selftest %} */export /* {% endif %} */function vary (on: string[] | string = []) {
  const headers = [].concat(<any>on) as string[]

  return (next: Handler) => {
    return async (context: Context) => {
      const response = await next(context)
      response[HEADERS].vary = [].concat(response[HEADERS].vary || [], <any>headers)
      return response
    }
  }
}
