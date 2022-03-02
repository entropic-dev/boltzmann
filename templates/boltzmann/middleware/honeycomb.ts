void `{% if selftest %}`;
import { beeline, honeycomb, otel, otelSemanticConventions } from '../core/honeycomb'
import assert from 'assert'
export { trace, honeycombMiddlewareSpans }
import { ServerResponse } from 'http'
import { Handler } from '../core/middleware'
import { Context } from '../data/context'
import onHeaders from 'on-headers'
import isDev from 'are-we-dev'
void `{% endif %}`;

function traceName(method: string, pathname: string) {
  return `${method} ${pathname}`
}

function middlewareSpanName(name?: string) {
  return `mw: ${name || '<unknown>'}`
}

function paramSpanAttribute(param: string): string {
  return `boltzmann.http.request.param.${param}`
}

export {
  traceName,
  middlewareSpanName,
  paramSpanAttribute
}

// The trace middleware creates a request-level span or trace. It delegates
// to either a beeline or OpenTelemetry implementation depending on how
// the honeycomb object is configured.
trace.doNotTrace = true
function trace ({
  headerSources = ['x-honeycomb-trace', 'x-request-id'],
} = {}) {
  if (!honeycomb.features.honeycomb || !honeycomb.initialized) {
    return (next: Handler) => (context: Context) => next(context)
  }

  if (honeycomb.features.beeline) {
    return beelineTrace({ headerSources })
  }

  // Note: headerSources is not respected by otel tracing!
  return otelTrace()
}

// The spans middleware creates a span on top of nested middleware, injected
// between middlewares in the core buildMiddleware step. It delegates to
// either a beeline or OpenTelemetry implementation depending on how the
// honeycomb object is configured.
function honeycombMiddlewareSpans ({name, doNotTrace}: {name?: string, doNotTrace?: boolean} = {}) {
  if (!honeycomb.features.honeycomb || doNotTrace) {
    return (next: Handler) => (context: Context) => next(context)
  }

  if (honeycomb.features.beeline) {
    return beelineMiddlewareSpans({name})
  }

  return otelMiddlewareSpans({name})
}

// Beeline implementations of trace and span, respectively.

function beelineTrace ({
  headerSources = ['x-honeycomb-trace', 'x-request-id'],
} = {}) {
  const schema = require('honeycomb-beeline/lib/schema')
  const tracker = require('honeycomb-beeline/lib/async_tracker')

  return function honeycombTrace (next: Handler) {
    return (context: Context) => {
      const traceContext = _getTraceContext(context)

      const trace = beeline.startTrace({
        [schema.EVENT_TYPE]: 'boltzmann',
        [schema.PACKAGE_VERSION]: '1.0.0',
        [schema.TRACE_SPAN_NAME]: traceName(context.method, context.url.pathname),
        [schema.TRACE_ID_SOURCE]: traceContext.source,
        'request.host': context.host,
        'request.original_url': context.url.href,
        'request.remote_addr': context.remote,
        'request.method': context.method,
        'request.scheme': context.url.protocol,
        'request.path': context.url.pathname,
        'request.query': context.url.search,
        // for forward compatibility with OpenTelemetry traces
        [otelSemanticConventions.SemanticResourceAttributes.SERVICE_NAME]: honeycomb.options.serviceName,
        'boltzmann.honeycomb.trace_type': 'beeline'
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

function beelineMiddlewareSpans ({name}: {name?: string} = {}) {
  return function honeycombSpan (next: Handler) {
    return async (context: Context) => {
      const span = beeline.startSpan({
        name: middlewareSpanName(name)
      })

      // Assumption: the invariant middleware between each layer
      // will ensure that no errors are thrown from next().
      const result = await next(context)

      beeline.finishSpan(span)
      return result
    }
  }
}

/*
 * ┏┓
 * ┃┃╱╲ in
 * ┃╱╱╲╲ this
 * ╱╱╭╮╲╲house
 * ▔▏┗┛▕▔ we
 * ╱▔▔▔▔▔▔▔▔▔▔╲
 * trace with opentelemetry
 * ╱╱┏┳┓╭╮┏┳┓ ╲╲
 * ▔▏┗┻┛┃┃┗┻┛▕▔
 */
function otelTrace () {
  return function honeycombTrace (next: Handler) {
    return (context: Context) => {
      let traceContext = otel.context.active()

      // Typically, HTTP auto-instrumentation will create a parent span for us
      let span: otel.Span | undefined = otel.trace.getSpan(traceContext)

      // startSpan should always return a span, but as far as typescript is
      // concerned the span could still be undefined. We could assert that it
      // exists, but throwing instrumentation-related errors is poor form.
      if (span) {
        // for backwards compatibility with beeline traces
        span.setAttribute('boltzmann.http.query', context.url.search)

        // the default name for the http span is BAD - let's fix it
        span.updateName(traceName(context.method, context.url.pathname))

        traceContext = otel.trace.setSpan(traceContext, span)

        if (isDev()) {
          context._honeycombTrace = span
        }
      } else {
        otel.diag.error(String(new assert.AssertionError({
          message: 'no parent span found or created',
          actual: span,
          expected: true,
          operator: '=='
        }).stack))
      }

      onHeaders(context._response, function () {
        const handler: Handler = <Handler>context.handler

        if (!span) {
          return
        }

        span.setAttribute(
          otelSemanticConventions.SemanticResourceAttributes.SERVICE_VERSION,
          <string>handler.version
        )

        Object.entries(context.params).forEach(([key, value]) => {
          if (span) {
            span.setAttribute(paramSpanAttribute(key), value)
          }
        })
      })

      return otel.context.with(traceContext, () => {
        return next(context)
      })
    }
  }
}

function otelMiddlewareSpans ({name}: {name?: string} = {}) {
  return function honeycombSpan (next: Handler) {
    return async (context: Context) => {
      let traceContext = otel.context.active()

      const span = honeycomb.tracer.startSpan(
        middlewareSpanName(name),
        { kind: otel.SpanKind.SERVER },
        traceContext
      )
      traceContext = otel.trace.setSpan(traceContext, span)

      const result = await otel.context.with(traceContext, () => {
        return next(context)
      })

      span.end()

      return result
    }
  }
}

void `{% if selftest %}`
import tap from 'tap'
type Test = (typeof tap.Test)["prototype"]

/* c8 ignore next */
if (require.main === module) {
  const { test } = tap

  test('traceName', async (assert: Test) => {
    assert.same(
      traceName('GET', '/echo'),
      'GET /echo'
    )
  });

  test('middlewareSpanName', async (assert: Test) => {
    assert.same(middlewareSpanName('test'), 'mw: test')
    assert.same(middlewareSpanName(undefined), 'mw: <unknown>')
  })
}

void `{% endif %}`
