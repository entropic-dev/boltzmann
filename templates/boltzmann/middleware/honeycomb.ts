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
      return honeycomb.withTrace(context, () => new Promise((resolve, reject) => {
        const p = next(context)

        // TODO: This action needs to happen asynchronously - that is, the
        // middleware stack needs to resolve before the headers get sent and
        // we close the span.
        //
        // The likely implication of this is that we won't be able to use
        // the context manager API - at least not directly. Instead, we'll
        // want to go back to endTrace/endSpan.

        // do not do as I do,
        onHeaders(context._response, () => {
          p.then((result: any) => {
            resolve(result);
          }, reject)
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
