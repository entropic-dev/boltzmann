void `{% if selftest %}`;
export { trace, honeycombMiddlewareSpans }

import { context as otelContext, trace as otelTrace, Tracer as OtelTracer} from '@opentelemetry/api'
import { Handler } from '../core/middleware'
import { Context } from '../data/context'
import { ServerResponse } from 'http'
import onHeaders from 'on-headers'
import beeline from 'honeycomb-beeline'
import isDev from 'are-we-dev'
void `{% endif %}`;

let otelTracer: OtelTracer | null = null;

function getOtelTracer() {
  if (!otelTracer) {
    otelTracer = otelTrace.getTracer('boltzmann', '1.0.0')
  }
  return otelTracer
}

function trace ({
  headerSources = ['x-honeycomb-trace', 'x-request-id'],
} = {}) {
  if (!process.env.HONEYCOMB_WRITEKEY) {
    return (next: Handler) => (context: Context) => next(context)
  }

  if (process.env.HONEYCOMB_API_HOST) {
    return function honeycombOtelTrace (next: Handler) {
      return (context: Context) => {
        const activeContext = otelContext.active()
        const tracer = getOtelTracer()

        const rootSpan = tracer.startSpan(`${context.method} ${context.url.pathname}${context.url.search}`, {
          attributes: {
            'request.host': context.host,
            'request.original_url': context.url.href,
            'request.remote_addr': context.remote,
            'request.method': context.method,
            'request.scheme': context.url.protocol,
            'request.path': context.url.pathname,
            'request.query': context.url.search
          }
        }, activeContext)

        otelTrace.setSpan(activeContext, rootSpan)

        // do not do as I do,
        onHeaders(context._response, function () {
          rootSpan.setAttribute('response.status_code', String(context._response.statusCode))
          if (context.handler) {
            const handler = context.handler;
            if (handler.route) {
              rootSpan.setAttribute('request.route', handler.route)
            }
            if (handler.method) {
              rootSpan.setAttribute('request.method', handler.method)
            }
            if (handler.version) {
              rootSpan.setAttribute('request.version', handler.version)
            }
          }
          Object.entries(context.params).map(([key, value]) => {
            rootSpan.setAttribute(`request.param.${key}`, value)
          })

          rootSpan.end()
        })

        return next(context)
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

        // do not do as I do,
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
  if (!process.env.HONEYCOMB_WRITEKEY) {
    return (next: Handler) => (context: Context) => next(context)
  }

  if (process.env.HONEYCOMB_API_HOST) {
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


