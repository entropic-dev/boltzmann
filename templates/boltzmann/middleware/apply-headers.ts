// {% if selftest %}
import { Handler } from '../core/middleware'
import { Context } from '../data/context'
// {% endif %}

/* {% if selftest %} */export /* {% endif %} */function applyHeaders (headers: Record<string, string | string[]> = {}) {
  return (next: Handler) => {
    return async function xfo (context: Context) {
      const result = await next(context)
      Object.assign(result[Symbol.for('headers')], headers)
      return result
    }
  }
}

type XFOMode = 'DENY' | 'SAMEORIGIN'
/* {% if selftest %} */export /* {% endif %} */const applyXFO = (mode: XFOMode) => {
  if (!['DENY', 'SAMEORIGIN'].includes(mode)) {
    throw new Error('applyXFO(): Allowed x-frame-options directives are DENY and SAMEORIGIN.')
  }
  return applyHeaders({ 'x-frame-options': mode })
}
