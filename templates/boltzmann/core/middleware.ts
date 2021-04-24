// {% if selftest %}
import beeline from 'honeycomb-beeline'
import { HTTPMethod } from 'find-my-way'
import isDev from 'are-we-dev'

import { enforceInvariants } from '../middleware/enforce-invariants'
import { honeycombMiddlewareSpans } from '../middleware/honeycomb'
import { BodyParserDefinition } from '../core/body'
import { route } from '../middleware/route'
import { Context } from '../data/context'
import { dev } from '../middleware/dev'

export { Handler, Adaptor, Middleware, MiddlewareConfig, buildMiddleware, handler }
// {% endif %}

interface Handler {
  (context: Context): Promise<any> | any,
  method?: HTTPMethod[] | HTTPMethod,
  route?: string,
  version?: string,
  decorators?: Adaptor[],
  bodyParsers?: BodyParserDefinition[],
  middleware?: MiddlewareConfig[],
  // {% if esbuild %}
  entry?: string
  // {% endif %}
}

interface Adaptor {
  (next: Handler): Handler | Promise<Handler>
}

interface Middleware {
  (...args: any[]): Adaptor
  name?: string
}

type MiddlewareConfig = Middleware | [Middleware, ...any[]]

async function buildMiddleware (middleware: MiddlewareConfig[], router: Handler) {
  const middlewareToSplice = (
    isDev()
    ? (mw: Middleware) => [
      // {% if honeycomb %}
      honeycombMiddlewareSpans(mw),
      // {% endif %}
      dev(mw.name),
      enforceInvariants()
    ]
    : (mw: Middleware) => [
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

async function handler (context: Context) {
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
    if (process.env.HONEYCOMBIO_WRITE_KEY && span !== null) {
      beeline.finishSpan(span)
    }
  }
  // {% endif %}
}
