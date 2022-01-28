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
    return async (context: Context) => {
      const trace = await honeycomb.startTrace(context, headerSources)

      // do not do as I do,
      onHeaders(context._response, async () => {
        await trace.end()
      })

      return next(context)
    }
  }
}

function honeycombMiddlewareSpans ({name}: {name?: string} = {}) {
  if (honeycomb.options.disable) {
    return (next: Handler) => (context: Context) => next(context)
  }

  function honeycombSpan (next: Handler) {
    return async (context: Context): Promise<any> => {
      const span = await honeycomb.startSpan(`mw: ${name}`)

      // Assumption: the invariant middleware between each layer
      // will ensure that no errors are thrown to next().
      const result = await next(context)
      await span.end()
      return result
    }
  }

  return honeycombSpan
}
