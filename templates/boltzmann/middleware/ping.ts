void `{% if selftest %}`;
export { handlePing }

import { Handler } from '../core/middleware'
import { Context } from '../data/context'
import { ship } from '../core/prelude'
void `{% endif %}`;

function handlePing () {
  return (next: Handler) => (context: Context) => {
    if (context.url.pathname === '/monitor/ping') {
      return ship
    }
    return next(context)
  }
}
