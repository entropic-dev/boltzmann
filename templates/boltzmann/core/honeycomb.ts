'use strict'

import assert from 'assert'
import { ServerResponse } from 'http'
import beeline from 'honeycomb-beeline'
import isDev from 'are-we-dev'
import { Metadata, credentials } from '@grpc/grpc-js'
import {
  context as traceContext,
  defaultTextMapGetter,
  defaultTextMapSetter,
  ROOT_CONTEXT,
  Sampler,
  trace,
  Tracer
} from '@opentelemetry/api'
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  W3CTraceContextPropagator
} from '@opentelemetry/core'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'
import { Resource } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { SimpleSpanProcessor, SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import {
  SemanticAttributes,
  SemanticResourceAttributes
} from '@opentelemetry/semantic-conventions'

// TODO: right now we install only instrumentation which
// covers node core, redis and postgres. there's both a
// question here of a) which instrumentations get loaded; and
// b) whether this should be more configurable than boltzmann's
// feature flags currently allow.
//
// some relevant instrumentations to consider:
//
// * @opentelemetry/instrumentation-grpc
// * @opentelemetry/instrumentation-graphql
// * some third-party instrumentation for undici
import { Instrumentation } from '@opentelemetry/instrumentation'
import { DnsInstrumentation } from '@opentelemetry/instrumentation-dns'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'

void `{% if redis %}`;
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis'
void `{% endif %}`

void `{% if postgres %}`
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
void `{% endif %}`

import { Context as Context } from '../data/context'
import { Handler } from './middleware'

// Some non-standard OpenTelemetry attributes
const OTEL_REQ_QUERY = 'boltzmann.query'
const OTEL_REQ_PARAM_NAMESPACE = 'boltzmann.request.param'

// State set on init
let enabled: boolean = false
let otelEnabled: boolean = false
let initialized: boolean = false
let started: boolean = false
let __sdk__: NodeSDK | null = null

// A type for the init function's arguments
interface Options {
  enabled?: boolean;
  otel?: boolean;
  writeKey?: string | null;
  dataset?: string | null;
  apiHost?: string | null;
  sampleRate?: number;
}

// Extract init options from the environment
function getOptionsFromEnv(env: typeof process.env): Options {
  const _enabled = !!env.HONEYCOMB_WRITEKEY
  let otel: boolean = false
  const writeKey = env.HONEYCOMB_WRITEKEY || null
  const dataset = env.HONEYCOMB_DATASET || null
  const apiHost = env.HONEYCOMB_API_HOST || null
  let sampleRate = 1

  sampleRate = Number(env.HONEYCOMB_SAMPLE_RATE || 1)

  if (isNaN(sampleRate)) {
    console.warn(
      `Unable to parse HONEYCOMB_SAMPLE_RATE=${env.HONEYCOMB_SAMPLE_RATE}, `
      + 'defaulting to 1'
    )
    sampleRate = 1
  }

  if (_enabled && apiHost) {
    otel = /^grpc:\/\//.test(apiHost)
  }

  return {
    enabled: _enabled,
    otel,
    writeKey,
    dataset,
    apiHost,
    sampleRate
  }
}

// Access those options in a type-safe-ish manner
function getWriteKey (options: Options): string {
  assert(options.enabled && options.writeKey)
  return options.writeKey as string
}

function getDataset (options: Options) {
  assert(options.enabled && options.dataset)
  return options.dataset as string
}

function getApiHost (options: Options) {
  assert(options.enabled && options.apiHost)
  return options.apiHost as string
}

// Factories are a dependency injection mechanism. If you don't like how
// something is being constructed and you're calling into this module, you
// can override behavior by defining the relevant factories.
interface Factories {
  metadata?: (options: Options) => Metadata;
  sampler?: (sampleRate: Number) => Sampler;
  tracerProvider?: (sampler: Sampler) => NodeTracerProvider;
  traceExporter?: (url: string, metadata: Metadata) => OTLPTraceExporter;
  spanProcessor?: (traceExporter: OTLPTraceExporter) => SpanProcessor;
  instrumentations?: () => Instrumentation[];
  sdk?: (
    serviceName: string,
    instrumentations: Instrumentation[],
    traceExporter: OTLPTraceExporter
  ) => NodeSDK;
}

const factories = {
  metadata (options: Options): Metadata {
    const metadata = new Metadata()

    metadata.set('x-honeycomb-team', getWriteKey(options))
    metadata.set('x-honeycomb-dataset', getDataset(options))
    return metadata
  },

  sampler (sampleRate: number): Sampler {
    let sampler: Sampler = new AlwaysOnSampler()

    if (sampleRate === 0) {
      sampler = new AlwaysOffSampler()
    } else if (sampleRate !== 1) {
      sampler = new ParentBasedSampler({
        root: new TraceIdRatioBasedSampler(sampleRate)
      })
    }

    return sampler
  },

  tracerProvider (sampler: Sampler): NodeTracerProvider {
    return new NodeTracerProvider({ sampler })
  },

  traceExporter (url: string, metadata: Metadata): OTLPTraceExporter {
    return new OTLPTraceExporter({
      url,
      credentials: credentials.createSsl(),
      metadata
    })
  },

  spanProcessor (traceExporter: OTLPTraceExporter): SpanProcessor {
    // There's a bug in the types here - SimpleSpanProcessor doesn't
    // take the optional Context argument in its signature and
    // typescript is understandably cranky about that.
    return <SpanProcessor>(new SimpleSpanProcessor(traceExporter) as unknown)
  },

  instrumentations () {
    let is: Instrumentation[] = [
      new DnsInstrumentation({}),
      new HttpInstrumentation({}),
    ]

    void `{% if redis %}`
    is.push(new RedisInstrumentation({}))
    void `{% endif %}`

    void `{% if postgres %}`
    is.push(new PgInstrumentation({}))
    void `{% endif %}`

    return is
  },

  sdk (
    serviceName: string,
    instrumentations: Instrumentation[],
    traceExporter: OTLPTraceExporter
  ): NodeSDK {
    return new NodeSDK({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: serviceName
      }),
      traceExporter,
      instrumentations
    })
  }
}

type CompleteFactories = typeof factories

/* Initialize Honeycomb! Stands up the otel node SDK if enabled,
 * otherwise sets up the beeline library.
 */
function init(
  serviceName: string,
  options: Options,
  overrides?: Factories
): void {
  if (!options.enabled) return;
  enabled = true
  if (!options.otel) {
    beeline({
      writeKey: getWriteKey(options),
      dataset: getDataset(options),
      sampleRate: options.sampleRate,
      serviceName,
    })
    return
  }

  otelEnabled = !!options.otel

  let f: CompleteFactories = {
    ...factories,
    ...(overrides || {})
  }

  const apiHost: string = getApiHost(options)
  const metadata: Metadata = f.metadata(options)

  const sampler: Sampler = f.sampler(options.sampleRate || 1)
  const provider: NodeTracerProvider = f.tracerProvider(sampler)
  const exporter = f.traceExporter(apiHost, metadata)
  const processor = f.spanProcessor(exporter)
  const instrumentations = f.instrumentations()

  provider.addSpanProcessor(processor)
  // TODO: do I need this?
  // provider.register()

  __sdk__ = f.sdk(serviceName, instrumentations, exporter)

  initialized = true
}

/* Initialize the opentelemetry SDK (if initialized) and add shutdown hooks.
 */
async function start(): Promise<void> {
  let exitCode = 0

  async function die(err: Error) {
    console.error(err.stack)
    exitCode = 1
    await shutdown()
  }

  async function shutdown() {
    if (__sdk__) {
      try {
        await __sdk__.shutdown()
      } catch (err) {
        console.error(err.stack)
      }
    }
    process.exit(exitCode)
  }

  if (__sdk__) {
    process.once('SIGTERM', shutdown)
    process.once('beforeExit', shutdown)
    process.once('uncaughtException', die)
    process.once('unhandledRejection', die)
    await __sdk__.start()
    started = true
    return
  }
}

let _tracer: Tracer | null = null

function getTracer() {
  if (!_tracer) {
    _tracer = trace.getTracer('boltzmann', '1.0.0')
  }
  return _tracer
}

/* Start a trace. Calls the runInContext function after the trace is
 * started, awaits it, then closes the span before passing through
 * runInContext's return value.
 */
async function withTrace(
  context: Context,
  runInContext: () => Promise<any>,
  headerSources?: string[]
): Promise<any> {
  if (!otelEnabled) {
    // Call legacy beelines implementation
    return withBeelineTrace(context, runInContext, headerSources)
  }

  if (headerSources) {
    console.warn('trace headerSources are a beeline-only feature')
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

  const tracer = getTracer()
  let carrier = {}

  // Start a parent span
  const parentSpan = tracer.startSpan(
    `${context.method} ${context.url.pathname}${context.url.search}`,
    {
      attributes: {
        [SemanticAttributes.HTTP_HOST]: context.host,
        [SemanticAttributes.HTTP_URL]: context.url.href,
        [SemanticAttributes.NET_PEER_IP]: context.remote,
        [SemanticAttributes.HTTP_METHOD]: context.method,
        [SemanticAttributes.HTTP_SCHEME]: context.url.protocol,
        [SemanticAttributes.HTTP_ROUTE]: context.url.pathname,
        [OTEL_REQ_QUERY]: context.url.search
      }
    }
  )

  // this propagator takes care of extracting trace parent
  // and state from request headers (and so on)
  const propagator = new W3CTraceContextPropagator()

  propagator.inject(
    trace.setSpanContext(
      ROOT_CONTEXT,
      parentSpan.spanContext()
    ),
    carrier,
    defaultTextMapSetter
  )

  /* TODO: Do I need to create and set a context? No, right?

  // create a parent active context
  const parentContext = propagator.extract(
    ROOT_CONTEXT,
    carrier,
    defaultTextMapGetter
  )

  // set the active context
  await traceContext.with(parentContext, async () => {

  */

  const rv = await runInContext()

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

  return rv
}

const defaultHeaderSources = [ 'x-honeycomb-trace', 'x-request-id' ]

/* A beelines implementation of startTrace.
 */
async function withBeelineTrace(
  context: Context,
  runInContext: () => Promise<void>,
  headerSources?: string[]
): Promise<any> {
  const schema = require('honeycomb-beeline/lib/schema')
  const tracker = require('honeycomb-beeline/lib/async_tracker')

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

  if (!trace) return runInContext()

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

  const result = await runInContext()

  boundFinisher(tracker.getTracked())

  return result

  function _getBeelineTraceContext (context: Context) {
    const source = (headerSources || defaultHeaderSources).find(header => header in context.headers)

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

async function withSpan(name: string, runInContext: () => Promise<any>): Promise<any> {
  if (!otelEnabled) {
    // Call legacy beelines implementation
    return withBeelineSpan(name, runInContext)
  }

  const activeContext = traceContext.active()
  const tracer = getTracer()
  const span = tracer.startSpan(name)
  trace.setSpan(activeContext, span)

  const result = await runInContext()

  span.end()

  return result
}

async function withBeelineSpan(name: string, runInContext: () => Promise<any>): Promise<any> {
    const span = beeline.startSpan({ name })

    const result = await runInContext()

    beeline.finishSpan(span)

    return result
}

export {
  beeline,
  enabled,
  factories,
  Factories,
  getOptionsFromEnv,
  init,
  initialized,
  Options,
  otelEnabled,
  start,
  started,
  withSpan,
  withTrace
}

void `{% if selftest %}`;
import tap from 'tap'
type Test = (typeof tap.Test)["prototype"]

/* c8 ignore next */
if (require.main === module) {
  const { test } = tap

  test('getOptionsFromEnv', async (t: Test) => {
    t.test('options.enabled', async (assert: Test) => {
      assert.equal(
        getOptionsFromEnv({}).enabled,
        false,
        'should be disabled when no env vars'
      )
      assert.equal(
        getOptionsFromEnv({HONEYCOMB_WRITEKEY: ''}).enabled,
        false,
        'should be disabled when env vars are blank'
      )
      assert.equal(
        getOptionsFromEnv({HONEYCOMB_WRITEKEY: 'some write key'}).enabled,
        true,
        'should be enabled when write key is defined'
      )
    })

    t.test('options.otel', async (assert: Test) => {
      assert.equal(
        getOptionsFromEnv({}).otel,
        false,
        'should not use otel when no env vars'
      )
      assert.equal(
        getOptionsFromEnv({HONEYCOMB_WRITEKEY: ''}).otel,
        false,
        'should not use otel when env vars are blank'
      )
      assert.equal(
        getOptionsFromEnv({HONEYCOMB_WRITEKEY: 'some write key'}).otel,
        false,
        'should not use otel when only write key is defined'
      )
      assert.equal(
        getOptionsFromEnv({
          HONEYCOMB_WRITEKEY: 'some write key',
          HONEYCOMB_API_HOST: 'https://refinery.website'
        }).otel,
        false,
        'should not use otel when API host is not grpc://'
      )
      assert.equal(
        getOptionsFromEnv({
          HONEYCOMB_WRITEKEY: 'some write key',
          HONEYCOMB_API_HOST: 'grpc://otel.website'
        }).otel,
        true,
        '*should* use otel when API host is grpc://'
      )
      assert.equal(
        getOptionsFromEnv({
          HONEYCOMB_WRITEKEY: '',
          HONEYCOMB_API_HOST: 'grpc://otel.website'
        }).otel,
        false,
        'should not use otel when write key is empty, even if API host is grpc://'
      )
    })

    t.test('options.sampleRate', async (assert: Test) => {
      assert.equal(
        getOptionsFromEnv({}).sampleRate,
        1,
        'should be 1 by default'
      )
      assert.equal(
        getOptionsFromEnv({
          HONEYCOMB_SAMPLE_RATE: '1'
        }).sampleRate,
        1,
        'should be 1 if defined as 1'
      )
      assert.equal(
        getOptionsFromEnv({
          HONEYCOMB_SAMPLE_RATE: '0.5'
        }).sampleRate,
        0.5,
        'should be 0.5 if defined as 0.5'
      )
      assert.equal(
        getOptionsFromEnv({
          HONEYCOMB_SAMPLE_RATE: 'pony'
        }).sampleRate,
        1,
        'should be 1 if not parseable'
      )
    })

    t.test('options.apiHost', async (assert: Test) => {
      assert.equal(
        getOptionsFromEnv({}).apiHost,
        null,
        'should be null when no env var'
      )
      assert.equal(
        getOptionsFromEnv({
          HONEYCOMB_API_HOST: 'https://example.com'
        }).apiHost,
        'https://example.com',
        'should be url if url'
      )
    })
  })
  test('factories', async (t: Test) => {
    const options = {
      enabled: true,
      otel: true,
      writeKey: 'some write key',
      dataset: 'some dataset',
      apiHost: 'grpc://example.com',
      sampleRate: 1,
    }

    t.test('metadata', async (assert: Test) => {
      const metadata = factories.metadata(options)
      assert.same(
        metadata.get('x-honeycomb-team'),
        ['some write key'],
        'should have the write key set'
      )
      assert.same(
        metadata.get('x-honeycomb-dataset'),
        ['some dataset'],
        'shoupld have the dataset set'
      )
    })

    t.test('sampler', async (assert: Test) => {
      assert.ok(
        factories.sampler(1) instanceof AlwaysOnSampler,
        'sampler(1) should be an AlwaysOnSampler'
      )
      assert.ok(
        factories.sampler(0) instanceof AlwaysOffSampler,
        'sampler(0) should be an AlwaysOffSampler'
      )
      assert.ok(
        factories.sampler(0.5) instanceof ParentBasedSampler,
        'sampler(0.5) should be a ParentBasedSampler'
      )
    })

    test('tracerProvider', async (assert: Test) => {
      const sampler = factories.sampler(1)
      assert.doesNotThrow(
        () => factories.tracerProvider(sampler),
        'should create a tracer provider'
      )
    })

    test('traceExporter', async (assert: Test) => {
      assert.doesNotThrow(() => {
        const url = 'grpc://example.com'
        const metadata = factories.metadata(options)

        factories.traceExporter(url, metadata)
      }, 'should create a trace exporter')
    })

    test('spanProcessor', async (assert: Test) => {
      assert.doesNotThrow(() => {
        const exporter = factories.traceExporter(
          'grpc://example.com',
          factories.metadata(options)
        )

        factories.spanProcessor(exporter)
      }, 'should create a span processor')
    })

    test('instrumentations', async (assert: Test) => {
      // expected instrumentations: dns, node core, postgres, redis
      assert.equal(
        factories.instrumentations().length,
        4,
        'should create 4 instrumentations (dns, http, postgres, redis)'
      )
    })

    test('sdk', async (assert: Test) => {
      // run the init function
      assert.doesNotThrow(() => {
        const exporter = factories.traceExporter(
          'grpc://example.com',
          factories.metadata(options)
        )
        const instrumentations = factories.instrumentations()
        factories.sdk('boltzmann', instrumentations, exporter)
      }, 'should create an sdk')
    })
  })
}

void `{% endif %}`
