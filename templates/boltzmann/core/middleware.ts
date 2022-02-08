void `{% if selftest %}`;
export { Handler, Adaptor, Middleware, MiddlewareConfig, Response, buildMiddleware, handler }

import { HTTPMethod } from 'find-my-way'
import isDev from 'are-we-dev'

import { otelSemanticConventions } from '../core/honeycomb'
import { enforceInvariants } from '../middleware/enforce-invariants'
import { honeycombMiddlewareSpans } from '../middleware/honeycomb'
import { BodyParserDefinition } from '../core/body'
import { honeycomb, HttpMetadata } from '../core/prelude'
import { route } from '../middleware/route'
import { Context } from '../data/context'
import { dev } from '../middleware/dev'
void `{% endif %}`;

type Response = (
  void |
  string |
  AsyncIterable<Buffer> |
  Buffer |
  { [key: string]: any } |
  (AsyncIterable<Buffer> & HttpMetadata) |
  (Buffer & HttpMetadata) |
  ({ [key: string]: any } & HttpMetadata)
)

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

  // TODO: This check is for backwards-compatibility reasons and may be
  // removed in the future.
  const spanOpts = honeycomb.features.otel ? {
    [otelSemanticConventions.SemanticAttributes.HTTP_METHOD]: String(handler.method),
    [otelSemanticConventions.SemanticAttributes.HTTP_ROUTE]: handler.route,
    'boltzmann.http.handler.name': handler.name,
    'boltzmann.http.handler.version': handler.version || '*',
    'boltzmann.http.handler.decorators': String(handler.decorators)
  } : {
    'handler.name': handler.name,
    'handler.method': String(handler.method),
    'handler.route': handler.route,
    'handler.version': handler.version || '*',
    'handler.decorators': String(handler.decorators)
  }

  const span = await honeycomb.startSpan(`handler: ${handler.name}`, spanOpts)

  try {
    // {% endif %}
    return await handler(context)
    // {% if honeycomb %}
  } finally {
    await span.end()
  }
  // {% endif %}
}
