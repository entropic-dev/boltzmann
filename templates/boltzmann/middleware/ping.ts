// {% if selftest %}
import ships from 'culture-ships'
import { Handler } from '../core/middleware'
import { Context } from '../data/context'
const ship = ships.random()
// {% endif %}

/* {% if selftest %} */ export /* {% endif %} */function handlePing () {
  return (next: Handler) => (context: Context) => {
    if (context.url.pathname === '/monitor/ping') {
      return ship
    }
    return next(context)
  }
}
