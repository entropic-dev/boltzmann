void `{% if selftest %}`;
export { trace, honeycombMiddlewareSpans }

import { Handler } from '../core/middleware'
import { Context } from '../data/context'
import { ServerResponse } from 'http'
import onHeaders from 'on-headers'
import beeline from 'honeycomb-beeline'
import isDev from 'are-we-dev'
void `{% endif %}`;

function trace ({
  headerSources = ['x-honeycomb-trace', 'x-request-id'],
} = {}) {
  if (!process.env.HONEYCOMB_WRITEKEY) {
    return (next: Handler) => (context: Context) => next(context)
  }

  const schema = require('honeycomb-beeline/lib/schema')
  const tracker = require('honeycomb-beeline/lib/async_tracker')

  return function honeycombTrace (next: Handler) {
    return (context: Context) => {
      const traceContext = _getTraceContext(context)
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

  function _getTraceContext (context: Context) {
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

  return function honeycombSpan (next: Handler) {
    return async (context: Context) => {
      const span = beeline.startSpan({
        name: `mw: ${name}`
      })

      // Assumption: the invariant middleware between each layer
      // will ensure that no errors are thrown from next().
      const result = await next(context)
      beeline.finishSpan(span)
      return result
    }
  }
}


