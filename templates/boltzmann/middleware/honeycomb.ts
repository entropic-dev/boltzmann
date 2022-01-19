void `{% if selftest %}`;
export { trace, honeycombMiddlewareSpans }
import {
  context as otelContext,
  defaultTextMapGetter,
  defaultTextMapSetter,
  ROOT_CONTEXT,
  trace as otelTrace,
  Tracer as OtelTracer
} from '@opentelemetry/api'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { SemanticAttributes, SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { isHoneycomb, isOtel } from '../core/prelude'
import { Handler } from '../core/middleware'
import { Context } from '../data/context'
import { ServerResponse } from 'http'
import onHeaders from 'on-headers'
import beeline from 'honeycomb-beeline'
import isDev from 'are-we-dev'
void `{% endif %}`;

let otelTracer: OtelTracer | null = null;

const OTEL_NAMESPACE = 'boltzmann'
const OTEL_REQ_NAMESPACE = `${OTEL_NAMESPACE}.request`
const OTEL_REQ_QUERY = `${OTEL_REQ_NAMESPACE}.query`
const OTEL_REQ_PARAM_NAMESPACE = `${OTEL_REQ_NAMESPACE}.param`

function getOtelTracer() {
  if (!otelTracer) {
    otelTracer = otelTrace.getTracer('boltzmann', '1.0.0')
  }
  return otelTracer
}

function trace ({
  headerSources = ['x-honeycomb-trace', 'x-request-id'],
} = {}) {
  if (!isHoneycomb(process.env)) {
    return (next: Handler) => (context: Context) => next(context)
  }

  if (isOtel(process.env)) {
    return function honeycombOtelTrace (next: Handler) {
      return async (context: Context) => {
        const tracer = getOtelTracer()
        let carrier = {}

        // Start a parent span
        const parentSpan = tracer.startSpan(`${context.method} ${context.url.pathname}${context.url.search}`, {
          attributes: {
            [SemanticAttributes.HTTP_HOST]: context.host,
            [SemanticAttributes.HTTP_URL]: context.url.href,
            [SemanticAttributes.NET_PEER_IP]: context.remote,
            [SemanticAttributes.HTTP_METHOD]: context.method,
            [SemanticAttributes.HTTP_SCHEME]: context.url.protocol,
            [SemanticAttributes.HTTP_ROUTE]: context.url.pathname,
            [OTEL_REQ_QUERY]: context.url.search
          }
        })

        // this propagator takes care of extracting trace parent
        // and state from request headers (and so on)
        const propagator = new W3CTraceContextPropagator()

        propagator.inject(
          otelTrace.setSpanContext(
            ROOT_CONTEXT,
            parentSpan.spanContext()
          ),
          carrier,
          defaultTextMapSetter
        )

        // create a parent active context
        const parentContext = propagator.extract(
          ROOT_CONTEXT,
          carrier,
          defaultTextMapGetter
        )

        // set the active context
        otelContext.with(parentContext, () => {
          // keep the context active until we close the span
          return new Promise((resolve, reject) => {
            // do not do as I do,
            onHeaders(context._response, function () {
              // do our dangest to capture/handle surprise errors
              try {
                const handler: Handler = <Handler>context.handler

                parentSpan.setAttribute(
                  SemanticAttributes.HTTP_STATUS_CODE,
                  String(context._response.statusCode)
                )
                parentSpan.setAttribute(
                  SemanticAttributes.HTTP_ROUTE,
                  <string>handler.route
                )
                parentSpan.setAttribute(
                  SemanticAttributes.HTTP_METHOD,
                  <string>handler.method
                )
                parentSpan.setAttribute(
                  SemanticResourceAttributes.SERVICE_VERSION,
                  <string>handler.version
                )

                Object.entries(context.params).map(([key, value]) => {
                  parentSpan.setAttribute(
                    `${OTEL_REQ_PARAM_NAMESPACE}.${key}`,
                    value
                  )
                })
                parentSpan.end()
              } catch (err) {
                // we don't want to crash the route just because
                // otel didn't work...
                console.warn(err)
                return
              }
              // *now* we can exit the context
              resolve(null)
            })
          })
        })

        next(context)
      }
    }
  } else {
    const schema = require('honeycomb-beeline/lib/schema')
    const tracker = require('honeycomb-beeline/lib/async_tracker')

    return function honeycombTrace (next: Handler) {
      return (context: Context) => {
        const traceContext = _getBeelineTraceContext(context)
        const trace = beeline.startTrace({
          [schema.EVENT_TYPE]: 'boltzmann',
          [schema.PACKAGE_VERSION]: '1.0.0',
          [schema.TRACE_SPAN_NAME]: `${context.method} ${context.url.pathname}${context.url.search}`,
          [schema.TRACE_ID_SOURCE]: traceContext.source,
          'request.host': context.host,
          'request.original_url': context.url.href,
          'request.remote_addr': context.remote,
          'request.method': context.method,
          'request.scheme': context.url.protocol,
          'request.path': context.url.pathname,
          'request.query': context.url.search
        },
        traceContext.traceId,
        traceContext.parentSpanId,
        traceContext.dataset)

        if (isDev()) {
          context._honeycombTrace = trace
        }

        if (traceContext.customContext) {
          beeline.addContext(traceContext.customContext)
        }

        if (!trace) {
          return next(context)
        }

        const boundFinisher = beeline.bindFunctionToTrace((response: ServerResponse) => {
          beeline.addContext({
            'response.status_code': String(response.statusCode)
          })

          beeline.addContext({
            'request.route': context.handler.route,
            'request.method': context.handler.method,
            'request.version': context.handler.version
          })

          const params = Object.entries(context.params).map(([key, value]) => {
            return [`request.param.${key}`, value]
          })
          beeline.addContext(Object.fromEntries(params))

          beeline.finishTrace(trace)
        })

        onHeaders(context._response, function () {
          return boundFinisher(this, tracker.getTracked())
        })

        return next(context)
      }
    }
  }

  function _getBeelineTraceContext (context: Context) {
    const source = headerSources.find(header => header in context.headers)

    if (!source || !context.headers[source]) {
      return {}
    }

    if (source === 'x-honeycomb-trace') {
      const data = beeline.unmarshalTraceContext(context.headers[source])

      if (!data) {
        return {}
      }

      return Object.assign({}, data, { source: `${source} http header` })
    }

    return {
      traceId: context.headers[source],
      source: `${source} http header`
    }
  }
}

function honeycombMiddlewareSpans ({name}: {name?: string} = {}) {
  if (!isHoneycomb(process.env)) {
    return (next: Handler) => (context: Context) => next(context)
  }

  if (isOtel(process.env)) {
    return honeycombOtelSpan
  } else {
    return honeycombBeelineSpan
  }

  function honeycombOtelSpan (next: Handler) {
    return async (context: Context) => {
      const activeContext = otelContext.active()
      const tracer = getOtelTracer()
      const span = tracer.startSpan(`mw: ${name}`)
      otelTrace.setSpan(activeContext, span)

      // Assumption: the invariant middleware between each layer
      // will ensure that no errors are thrown from next().
      const result = await next(context)
      span.end()
      return result
    }
  }

  function honeycombBeelineSpan (next: Handler) {
    return async (context: Context) => {
      const span = beeline.startSpan({
        name: `mw: ${name}`
      })

      const result = await next(context)
      beeline.finishSpan(span)
      return result
    }
  }
}


void `{% if selftest %}`;

// import tap from 'tap'
// import { Test } from './test'

/* c8 ignore next */
/*
if (require.main === module) {
  // TODO: Tests
}
*/
void `{% endif %}`;

