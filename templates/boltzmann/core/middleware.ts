void `{% if selftest %}`;
export { Handler, Adaptor, Middleware, MiddlewareConfig, Response, buildMiddleware, handler }
import { honeycomb } from '../core/prelude'
import { beeline, getOtelTestSpans, otel, otelSemanticConventions } from '../core/honeycomb'
import { HttpMetadata } from '../core/prelude'
import { HTTPMethod } from 'find-my-way'
import isDev from 'are-we-dev'
import { enforceInvariants } from '../middleware/enforce-invariants'
import { honeycombMiddlewareSpans, trace } from '../middleware/honeycomb'
import { BodyParserDefinition } from '../core/body'
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
  name?: string,
  doNotTrace?: boolean
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

function handlerSpanName(handler: Handler) {
  return `handler: ${handler.name || '<unknown>'}`
}

async function handler (context: Context) {
  const handler = context.handler as Handler
  // {% if honeycomb %}
  let beelineSpan = null
  let otelSpan = null
  let parentOtelSpan = context.span
  if (honeycomb.features.beeline) {
    beelineSpan = beeline.startSpan({
      name: handlerSpanName(handler),
      'handler.name': handler.name,
      'handler.method': String(handler.method),
      'handler.route': handler.route,
      'handler.version': handler.version || '*',
      'handler.decorators': String(handler.decorators)
    })
  } else if (honeycomb.features.otel) {
    let traceContext = otel.context.active()

    if (context.span) {
      traceContext = otel.trace.setSpan(
        traceContext,
        context.span
      )
    }

    otelSpan = honeycomb.tracer.startSpan(
      handlerSpanName(handler),
      {
        attributes: {
          [otelSemanticConventions.SemanticAttributes.HTTP_METHOD]: String(handler.method),
          [otelSemanticConventions.SemanticAttributes.HTTP_ROUTE]: handler.route,
          'boltzmann.http.handler.name': handler.name || '<unknown>',
          'boltzmann.http.handler.version': handler.version || '*',
          'boltzmann.http.handler.decorators': String(handler.decorators),
        },
        kind: otel.SpanKind.SERVER
      },
      traceContext
    )
    otel.trace.setSpan(traceContext, otelSpan)
    context.span = otelSpan
  }

  try {
    // {% endif %}
    return await handler(context)
    // {% if honeycomb %}
  } finally {
    if (beelineSpan !== null) {
      beeline.finishSpan(beelineSpan)
    } else if (otelSpan !== null) {
      otelSpan.end()
      context.span = parentOtelSpan
    }
  }
  // {% endif %}
}

void `{% if selftest %}`
import tap from 'tap'
type Test = (typeof tap.Test)["prototype"]
import { runserver } from '../bin/runserver'
import { inject } from '@hapi/shot'

// A simple test middleware that intercepts the request prior to any
// handlers seeing it
const helloMiddleware: Middleware = () => {
  return (next: Handler) => {
    return (context: Context) => {
      return 'Hello!'
    }
  }
}

// A simple test handler which throws - useful for ensuring that the handler
// isn't called
const throwingHandler: Handler = (context: Context) => {
  throw new Error('handler should not be called')
}
throwingHandler.route = 'GET /'

/* c8 ignore next */
if (require.main === module) {
  const { test } = tap

  test('honeycomb-instrumented middlewares emit spans', async (assert: Test) => {
    const server = await runserver({
      middleware: [
        // The "trace" middleware is marked as doNotTrace, so we shouldn't
        // be creating pre-trace spans (but should get a trace span)
        trace,
        // This middleware *should* get auto-spanned
        helloMiddleware
      ],
      handlers: { handler: throwingHandler }
    })
    const [onRequest] = server.listeners('request')
    const response = await inject(<any>onRequest, { method: 'GET', url: '/' })

    assert.same(response.payload, 'Hello!')

    const spans = getOtelTestSpans(honeycomb.spanProcessor)

    // assert.same(spans, [], 'un-comment this to render all spans')

    const boltzmannSpans = spans.map(span => {
      const context = span.spanContext()

      return {
        spanName: span.name,
        serviceName: String(span.resource.attributes['service.name']).split(':')[0],
        library: span.instrumentationLibrary.name,
        spanId: context.spanId,
        traceId: context.traceId,
        parentSpanId: span.parentSpanId,
        attributes: span.attributes
      }
 
    })

    assert.same(
      boltzmannSpans,
      [
        // The middleware span
        {
          spanName: 'mw: helloMiddleware',
          serviceName: 'test-app',
          library: 'boltzmann',
          traceId: boltzmannSpans[1].traceId,
          spanId: boltzmannSpans[0].spanId,
          parentSpanId: boltzmannSpans[1].spanId,
          // TODO: There *should* be attributes here, no?
          attributes: {}
        },
        // The request-level parent span
        {
          spanName: 'HTTP GET',
          serviceName: 'test-app',
          library: 'boltzmann',
          traceId: boltzmannSpans[1].traceId,
          spanId: boltzmannSpans[1].spanId,
          parentSpanId: undefined,
          attributes: {
            "http.host": "localhost",
            "http.url": "http://localhost/",
            "http.client_ip": "",
            "http.method": "GET",
            "http.scheme": "http:",
            "http.route": "/",
            "boltzmann.http.query": "",
            "http.status_code": "200",
            "service_name": "test-app",
            "boltzmann.honeycomb.trace_type": "otel"
          }
        },
     ],
      "There are two nested spans, in the same trace, with service name and attributes"
    )
  })
}

void `{% endif %}`
