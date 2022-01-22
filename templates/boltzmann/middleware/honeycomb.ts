void `{% if selftest %}`;
export { trace, honeycombMiddlewareSpans }
import { honeycomb } from '../core/prelude'
import { Handler } from '../core/middleware'
import { Context } from '../data/context'
import onHeaders from 'on-headers'
void `{% endif %}`;

function trace ({
  headerSources = ['x-honeycomb-trace', 'x-request-id'],
} = {}) {
  return function honeycombTrace (next: Handler) {
    return (context: Context) => {
      honeycomb.withTrace(context, () => new Promise((resolve, reject) => {
        const p = next(context)

        // do not do as I do,
        onHeaders(context._response, () => {
          p.then(resolve, reject)
        })
      }), headerSources)
    }
  }
}

function honeycombMiddlewareSpans ({name}: {name?: string} = {}) {
  if (honeycomb.options.disable) {
    return (next: Handler) => (context: Context) => next(context)
  }

  function honeycombSpan (next: Handler) {
    return async (context: Context): Promise<any> => {
      return honeycomb.withSpan(`mw: ${name}`, () => next(context))
    }
  }

  return honeycombSpan
}
