// {% if selftest %}
import { beeline } from 'honeycomb-beeline'
import { isDev } from 'are-we-dev'

import { enforceInvariants } from '../middleware/enforce-invariants'
import { honeycombMiddlewareSpans } from '../middleware/honeycomb'
import { route } from '../middleware/route'
import { Context } from '../data/context'
import { dev } from '../middleware/dev'
// {% endif %}

export interface Handler {
  (context: Context): Promise<any> | any;
  method?: string
  route?: string
  version?: string
  decorators?: ((next: Handler) => Handler)[]
  middleware?: MiddlewareConfig[]
}

export interface Adaptor {
  (next: Handler): Handler | Promise<Handler>;
}

export interface Middleware {
  (...args: any[]): Adaptor;
}

type MiddlewareConfig = Middleware | [Middleware, ...any[]]

/* {% if selftest %} */export /* {% endif %} */async function buildMiddleware (middleware: MiddlewareConfig[], router: Handler) {
  const middlewareToSplice = (
    isDev()
    ? (mw: MiddlewareConfig) => [
      // {% if honeycomb %}
      honeycombMiddlewareSpans(mw),
      // {% endif %}
      dev(mw),
      enforceInvariants()
    ]
    : (mw: MiddlewareConfig) => [
      // {% if honeycomb %}
      honeycombMiddlewareSpans(mw),
      // {% endif %}
      enforceInvariants()
    ]
  )
  const result = middleware.reduce((lhs: Adaptor[], rhs: MiddlewareConfig) => {
    const [mw, ...args] = Array.isArray(rhs) ? rhs : [rhs]
    return [...lhs, ...middlewareToSplice(mw), mw(...args)]
  }, []).concat(middlewareToSplice(route))

  // {% if honeycomb %}
  // drop the outermost honeycombMiddlewareSpans mw.
  result.shift()
  // {% endif %}


  return result.reduceRight(async (lhs: Promise<Handler>, rhs: Adaptor): Promise<Handler> => {
    return rhs(await lhs)
  }, Promise.resolve(router))
}

/* {% if selftest %} */export /* {% endif %} */async function handler (context: Context) {
  const handler = context.handler as Handler
  // {% if honeycomb %}
  let span = null
  if (process.env.HONEYCOMBIO_WRITE_KEY) {
    span = beeline.startSpan({
      name: `handler: ${handler.name}`,
      'handler.name': handler.name,
      'handler.method': String(handler.method),
      'handler.route': handler.route,
      'handler.version': handler.version || '*',
      'handler.decorators': String(handler.decorators)
    })
  }

  try {
    // {% endif %}
    return await handler(context)
    // {% if honeycomb %}
  } finally {
    if (process.env.HONEYCOMBIO_WRITE_KEY) {
      beeline.finishSpan(span)
    }
  }
  // {% endif %}
}
