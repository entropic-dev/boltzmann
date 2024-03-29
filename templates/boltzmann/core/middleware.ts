void `{% if selftest %}`;
export { Handler, Adaptor, Middleware, MiddlewareConfig, Response, buildMiddleware, handler }
import { beeline, getOtelMockSpans, honeycomb, otel, otelSemanticConventions } from '../core/honeycomb'
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
  let traceContext = otel.context.active()
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

    otelSpan = honeycomb.tracer.startSpan(
      handlerSpanName(handler),
      {
        attributes: {
          'boltzmann.http.handler.name': handler.name || '<anonymous>',
          'boltzmann.handler.method': String(handler.method),
          'boltzmann.handler.route': handler.route,
          'boltzmann.http.handler.version': handler.version || '*',
          'boltzmann.http.handler.decorators': String(handler.decorators)
        },
        kind: otel.SpanKind.INTERNAL
      },
      traceContext
    )
    traceContext = otel.trace.setSpan(traceContext, otelSpan)
  }

  try {
    return await otel.context.with(traceContext, async () => {
      // {% endif %}
      return await handler(context)
      // {% if honeycomb %}
    })
  } finally {
    if (beelineSpan !== null) {
      beeline.finishSpan(beelineSpan)
    } else if (otelSpan !== null) {
      otelSpan.end()
    }
  }
  // {% endif %}
}

void `{% if selftest %}`
import tap from 'tap'
type Test = (typeof tap.Test)["prototype"]
import { runserver } from '../bin/runserver'
import { inject } from '@hapi/shot'

const testMiddleware: Middleware = () => {
  return (next: Handler) => {
    return (context: Context) => {
      const span = otel.trace.getSpan(otel.context.active())
      if (span) {
        span.setAttribute('middleware_attribute', 'testing 123')
      }
      return next(context)
    }
  }
}

const testHandler: Handler = (context: Context) => {
  const span = otel.trace.getSpan(otel.context.active())
  if (span) {
    span.setAttribute('handler_attribute', 'testing 123')
  }
  return { ok: true }
}
testHandler.route = 'GET /'

/* c8 ignore next */
if (require.main === module) {
  const { test } = tap

  test('honeycomb-instrumented middlewares and handlers emit spans', async (assert: Test) => {
    const server = await runserver({
      middleware: [
        // The "trace" middleware is marked as doNotTrace, so we shouldn't
        // be creating pre-trace spans (but should get a trace span)
        trace,
        // This middleware *should* get auto-spanned
        testMiddleware
      ],
      handlers: { handler: testHandler }
    })
    const [onRequest] = server.listeners('request')

    // HTTP instrumentation won't get triggered, so we need to mock the parent
    // span

    let traceContext = otel.context.active()
    const span = honeycomb.tracer.startSpan(
      'HTTP GET',
      { kind: otel.SpanKind.INTERNAL, },
      traceContext
    )

    traceContext = otel.trace.setSpan(traceContext, span)

    const response = await otel.context.with(traceContext, async () => {
      return await inject(<any>onRequest, { method: 'GET', url: '/' })
    })

    span.end()
    assert.same(response.payload, '{"ok":true}')

    const spans = getOtelMockSpans(honeycomb.spanProcessor)

    const boltzmannSpans = spans.map(span => {
      const context = span.spanContext()

      return {
        spanName: span.name,
        serviceName: span.resource.attributes['service.name'],
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
        // The handler span
        {
          spanName: 'handler: testHandler',
          serviceName: 'test-app',
          library: 'boltzmann',
          traceId: boltzmannSpans[3].traceId,
          spanId: boltzmannSpans[0].spanId,
          parentSpanId: boltzmannSpans[1].spanId,
          // TODO: There *should* be attributes here, no?
          attributes: {
            "handler_attribute": "testing 123",
            "boltzmann.http.handler.name": "testHandler",
            "boltzmann.handler.method": "GET",
            "boltzmann.handler.route": "/",
            "boltzmann.http.handler.version": "*",
            "boltzmann.http.handler.decorators": "",
          }
        },
        // The route middleware span
        {
          spanName: 'mw: route',
          serviceName: 'test-app',
          library: 'boltzmann',
          traceId: boltzmannSpans[3].traceId,
          spanId: boltzmannSpans[1].spanId,
          parentSpanId: boltzmannSpans[2].spanId,
          // TODO: There *should* be attributes here, no?
          attributes: {}
        },
        // The test middleware span
        {
          spanName: 'mw: testMiddleware',
          serviceName: 'test-app',
          library: 'boltzmann',
          traceId: boltzmannSpans[3].traceId,
          spanId: boltzmannSpans[2].spanId,
          parentSpanId: boltzmannSpans[3].spanId,
          // TODO: There *should* be attributes here, no?
          attributes: {
            "middleware_attribute": "testing 123",
          }
        },
        // The request-level parent span
        {
          spanName: 'GET /',
          serviceName: 'test-app',
          library: 'boltzmann',
          traceId: boltzmannSpans[3].traceId,
          spanId: boltzmannSpans[3].spanId,
          parentSpanId: undefined,
          attributes: {
            "boltzmann.http.query": "",
          }
        },
     ],
      "There are four spans, with the expected relationships and attributes"
    )
  })
}

void `{% endif %}`
