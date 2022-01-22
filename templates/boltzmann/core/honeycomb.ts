'use strict'

/*{#
Hey, friend! Before you go to town, there's something you should
know:

!!! This file is included *before* the prelude !!!

You should read the comments in the prelude before continuing. But
once you're back, here are some ways that this file is both similar
to and different from that one:

1) Dependencies specific to honeycomb have to be imported and exported
   as in the prelude, for the same reasons.
2) Dependencies not specific to honeycomb should be required at the
   scope nearest to their use. This is so the namespace isn't polluted
   in the prelude.

Good luck!
#}*/

// We continue to support beelines...
import beeline from 'honeycomb-beeline'

// ...but are migrating to OpenTelemetry:
import { Metadata, credentials } from '@grpc/grpc-js'
import {
  context as traceContext,
  defaultTextMapSetter,
  ROOT_CONTEXT,
  Sampler,
  trace,
  Tracer
} from '@opentelemetry/api'
import {
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

// We include node core instrumentation, as well as redis
// and postgres instrumentation if those respective features
// are enabled.
//
// TODO: Can these be overridden?
//
// Some instrumentation that is NOT included, because boltzmann
// doesn't support the technology:
//
// * @opentelemetry/instrumentation-grpc
// * @opentelemetry/instrumentation-graphql
//
// TODO: Double-check these
//
// Some packages which, to our knowledge, don't have available
// instrumentations:
//
// * undici
import { Instrumentation } from '@opentelemetry/instrumentation'
import { DnsInstrumentation } from '@opentelemetry/instrumentation-dns'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'

void `{% if redis %}`;
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis'
void `{% endif %}`

void `{% if postgres %}`
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
void `{% endif %}`

// TODO: Sort through these and find a good answer
void `{% if selftest %}`
import assert from 'assert'
import { ServerResponse } from 'http'

// TODO: Imports from internal modules will
import { Context as Context } from '../data/context'
import { Handler } from './middleware'

import isDev from 'are-we-dev'
void `{% endif %}`

// Arguments passed to Honeycomb's constructor
interface HoneycombOptions {
  serviceName: string
  // When true, treat Honeycomb instrumentation as
  // disabled
  disable?: boolean

  // When true, Do Otel
  otel?: boolean

  // The Honeycomb write key and dataset
  writeKey?: string | null
  dataset?: string | null

  // If using OpenTelemetry, this is a grpc:// address
  apiHost?: string | null

  // Tunables, etc.
  sampleRate?: number
}

// Whether or not otel, beelines and honeycomb are enabled
interface HoneycombFeatures {
  honeycomb: boolean
  beeline: boolean
  otel: boolean
}

// There's a lot of plumbing that happens when setting up
// OpenTelemetry. In order to fully initialize it, we need
// to instantiate all of these object types.
//
// They're exposed on the Honeycomb class but in a nested
// namespace.
interface OTLPFactories {
  metadata: (writeKey: string, dataset: string) => Metadata
  sampler: (sampleRate: number) => Sampler
  tracerProvider: (sampler: Sampler) => NodeTracerProvider
  traceExporter: (url: string, metadata: Metadata) => OTLPTraceExporter
  spanProcessor: (traceExporter: OTLPTraceExporter) => SpanProcessor
  instrumentations: () => Instrumentation[]
  sdk: (
    serviceName: string,
    instrumentations: Instrumentation[],
    traceExporter: OTLPTraceExporter
  ) => NodeSDK
}

const defaultOTLPFactories: OTLPFactories = {
  metadata (writeKey: string, dataset: string): Metadata {
    const metadata = new Metadata()
    metadata.set('x-honeycomb-team', writeKey)
    metadata.set('x-honeycomb-dataset', dataset)
    return metadata
  },

  // create a Sampler object, which is used to tune
  // the sampling rate
  sampler (sampleRate: number): Sampler {
    return new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(sampleRate)
    })
  },

  // It provides tracers!
  tracerProvider (sampler: Sampler): NodeTracerProvider {
    return new NodeTracerProvider({ sampler })
  },

  // Export traces to an OTLP endpoint with GRPC
  traceExporter (url: string, metadata: Metadata): OTLPTraceExporter {
    return new OTLPTraceExporter({
      url,
      credentials: credentials.createSsl(),
      metadata
    })
  },

  // Process spans, using the supplied trace exporter to
  // do the actual exporting.
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

  // The SDK will take a service name, instrumentations
  // and a trace exporter and give us a stateful singleton.
  // This is that singleton!
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

// For testing purposes, it can be beneficial to
// override how objects in OpenTelemetry initialization
// are created. The Honeycomb class allows for
// passing overrides into its constructor.
interface OTLPFactoryOverrides {
  metadata?: (writeKey: string, dataset: string) => Metadata
  sampler?: (sampleRate: Number) => Sampler
  tracerProvider?: (sampler: Sampler) => NodeTracerProvider
  traceExporter?: (url: string, metadata: Metadata) => OTLPTraceExporter
  spanProcessor?: (traceExporter: OTLPTraceExporter) => SpanProcessor
  instrumentations?: () => Instrumentation[];
  sdk?: (
    serviceName: string,
    instrumentations: Instrumentation[],
    traceExporter: OTLPTraceExporter
  ) => NodeSDK;
}

class Honeycomb {
  // We load options from the environment. Unlike with Options,
  // we do a lot of feature detection here.
  public static fromEnv(
    serviceName: string,
    env: typeof process.env = process.env,
    overrides: OTLPFactoryOverrides = {}
  ): Honeycomb {
    return new Honeycomb(
      Honeycomb.parseEnv(serviceName, env),
      overrides
    )
  }

  // TODO: Can't inject serviceName here
  public static parseEnv(serviceName: string, env: typeof process.env = process.env): HoneycombOptions {
    // If there's no write key we won't get very far anyway
    const disable = !env.HONEYCOMB_WRITEKEY
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

    // If the API host is a grpc:// endpoint, we feature switch to
    // OpenTelemetry. There are prior uses of this variable here but
    // they should've been using https://.
    if (!disable && apiHost) {
      otel = /^grpc:\/\//.test(apiHost)
    }

    return {
      serviceName,
      disable,
      otel,
      writeKey,
      dataset,
      apiHost,
      sampleRate
    }
  }

  private getWriteKey (): string {
    assert(this.features.honeycomb && this.options.writeKey)
    return this.options.writeKey as string
  }

  private getDataset () {
    assert(this.features.honeycomb && this.options.dataset)
    return this.options.dataset as string
  }

  private getApiHost () {
    assert(this.features.honeycomb && this.options.apiHost)
    return this.options.apiHost as string
  }

  public options: HoneycombOptions
  public features: HoneycombFeatures
  public factories: OTLPFactories

  public initialized: boolean
  public started: boolean
  public sdk: NodeSDK | null
  public tracer: Tracer
  public static beeline: typeof beeline = beeline

  constructor(
    options: HoneycombOptions,
    overrides: OTLPFactoryOverrides = {}
  ) {
    this.options = options
    this.features = {
      honeycomb: !options.disable,
      beeline: !options.disable && !options.otel,
      otel: options.otel || false
    }
    this.initialized = false
    this.started = false
    this.sdk = null
    this.tracer = trace.getTracer('boltzmann', '1.0.0')
    this.factories = {
      ...defaultOTLPFactories,
      ...(overrides || {})
    }
  }

  // Some non-standard OpenTelemetry attributes we add in
  // the middlewares...

  public static OTEL_REQ_QUERY = 'boltzmann.query'

  public static paramAttribute(param: string): string {
    return `boltzmann.request.param.${param}`
  }

  // Initialize Honeycomb! Stands up the otel node SDK if enabled,
  // otherwise sets up the beeline library.
  // This needs to occur before any imports you want instrumentation
  // to be aware of.
  public init(): void {
    if (!this.features.honeycomb) return

    const writeKey = this.getWriteKey()
    const dataset = this.getDataset()
    const sampleRate = this.options.sampleRate || 1
    const serviceName = this.options.serviceName

    if (!this.features.otel) {
      beeline({ writeKey, dataset, sampleRate, serviceName })
      return
    }

    const f = this.factories
    const apiHost: string = this.getApiHost()

    const metadata: Metadata = f.metadata(writeKey, dataset)

    const sampler: Sampler = f.sampler(sampleRate)
    const exporter = f.traceExporter(apiHost, metadata)
    const processor = f.spanProcessor(exporter)
    const instrumentations = f.instrumentations()

    const provider: NodeTracerProvider = f.tracerProvider(sampler)
    provider.addSpanProcessor(processor)
    provider.register()

    this.sdk = f.sdk(
      serviceName,
      instrumentations,
      exporter
    )

    this.initialized = true
  }

  // Start the OpenTelemetry SDK. If using beelines, this is
  // a no-op. This needs to happen before anything happens in
  // the entrypoint and is an async operation.
  public async start(): Promise<void> {
    let exitCode = 0
    const sdk = this.sdk

    async function die(err: Error) {
      console.error(err.stack)
      exitCode = 1
      await shutdown()
    }

    async function shutdown() {
      if (sdk) {
        try {
          await sdk.shutdown()
        } catch (err) {
          console.error(err.stack)
        }
      }
      process.exit(exitCode)
    }

    if (sdk) {
      process.once('SIGTERM', shutdown)
      process.once('beforeExit', shutdown)
      process.once('uncaughtException', die)
      process.once('unhandledRejection', die)
      await sdk.start()
      this.started = true
    }
  }

  // Create a trace, call the runInContext function, then close the
  // trace after it resolved. For beeline, this is is a Trace;
  // for OpenTelemetry, it's a root span.
  public async withTrace(
    context: Context,
    runInContext: () => Promise<any>,
    headerSources?: string[]
  ): Promise<any> {
    if (!this.features.honeycomb) {
      // Call legacy beelines implementation
      return this.withBeelineTrace(context, runInContext, headerSources)
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

    const tracer = this.tracer
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
          // TODO: Honeycomb.Attributes obvs
          [Honeycomb.OTEL_REQ_QUERY]: context.url.search
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
        Honeycomb.paramAttribute(key),
        value
      )
    })
    parentSpan.end()

    return rv
  }

  private defaultHeaderSources: string[] = [ 'x-honeycomb-trace', 'x-request-id' ]

  /* A beelines implementation of startTrace.
   */
  async withBeelineTrace(
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

    const _headerSources = headerSources || this.defaultHeaderSources

    return result

    function _getBeelineTraceContext (context: Context) {
      const source = _headerSources.find((header: string) => header in context.headers)

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

  public async withSpan(name: string, runInContext: () => Promise<any>): Promise<any> {
    if (!this.features.otel) {
      // Call legacy beelines implementation
      return this.withBeelineSpan(name, runInContext)
    }

    const span = this.tracer.startSpan(name)
    trace.setSpan(traceContext.active(), span)

    const result = await runInContext()

    span.end()

    return result
  }

  private async withBeelineSpan(name: string, runInContext: () => Promise<any>): Promise<any> {
      const span = beeline.startSpan({ name })

      const result = await runInContext()

      beeline.finishSpan(span)

      return result
  }
}

export {
  beeline,
  Metadata,
  credentials,
  traceContext,
  defaultTextMapSetter,
  ROOT_CONTEXT,
  Sampler,
  trace,
  Tracer,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  W3CTraceContextPropagator,
  OTLPTraceExporter,
  Resource,
  NodeSDK,
  SimpleSpanProcessor,
  SpanProcessor,
  NodeTracerProvider,
  SemanticAttributes,
  SemanticResourceAttributes,
  Instrumentation,
  DnsInstrumentation,
  HttpInstrumentation,
  // {% if redis %}
  RedisInstrumentation,
  // {% endif %}
  // {% if postgres %}
  PgInstrumentation
  // {% endif %}
}

export {
  defaultOTLPFactories,
  Honeycomb,
  HoneycombOptions,
  HoneycombFeatures,
  OTLPFactories,
  OTLPFactoryOverrides,
}

void `{% if selftest %}`
import tap from 'tap'
type Test = (typeof tap.Test)["prototype"]

/* c8 ignore next */
if (require.main === module) {
  const { test } = tap

  test('Honeycomb.parseEnv', async (t: Test) => {
    t.test('options.disable', async (assert: Test) => {
      assert.equal(
        Honeycomb.parseEnv('boltzmann', {}).disable,
        true,
        'should be disabled when no env vars'
      )
      assert.equal(
        Honeycomb.parseEnv('boltzmann', {HONEYCOMB_WRITEKEY: ''}).disable,
        true,
        'should be disabled when env vars are blank'
      )
      assert.equal(
        Honeycomb.parseEnv('boltzmann', {HONEYCOMB_WRITEKEY: 'some write key'}).disable,
        false,
        'should be enabled when write key is defined'
      )
    })

    t.test('options.otel', async (assert: Test) => {
      assert.equal(
        Honeycomb.parseEnv('boltzmann', {}).otel,
        false,
        'should not use otel when no env vars'
      )
      assert.equal(
        Honeycomb.parseEnv('boltzmann', {HONEYCOMB_WRITEKEY: ''}).otel,
        false,
        'should not use otel when env vars are blank'
      )
      assert.equal(
        Honeycomb.parseEnv('boltzmann', {HONEYCOMB_WRITEKEY: 'some write key'}).otel,
        false,
        'should not use otel when only write key is defined'
      )
      assert.equal(
        Honeycomb.parseEnv(
          'boltzmann', 
          {
            HONEYCOMB_WRITEKEY: 'some write key',
            HONEYCOMB_API_HOST: 'https://refinery.website'
          }
        ).otel,
        false,
        'should not use otel when API host is not grpc://'
      )
      assert.equal(
        Honeycomb.parseEnv(
          'boltzmann',
          {
            HONEYCOMB_WRITEKEY: 'some write key',
            HONEYCOMB_API_HOST: 'grpc://otel.website'
          }
        ).otel,
        true,
        '*should* use otel when API host is grpc://'
      )
      assert.equal(
        Honeycomb.parseEnv(
          'boltzmann',
          {
            HONEYCOMB_WRITEKEY: '',
            HONEYCOMB_API_HOST: 'grpc://otel.website'
          }
        ).otel,
        false,
        'should not use otel when write key is empty, even if API host is grpc://'
      )
    })

    t.test('options.sampleRate', async (assert: Test) => {
      assert.equal(
        Honeycomb.parseEnv('boltzmann', {}).sampleRate,
        1,
        'should be 1 by default'
      )
      assert.equal(
        Honeycomb.parseEnv(
          'boltzmann', 
          { HONEYCOMB_SAMPLE_RATE: '1' }
        ).sampleRate,
        1,
        'should be 1 if defined as 1'
      )
      assert.equal(
        Honeycomb.parseEnv(
          'boltzmann',
          {
            HONEYCOMB_SAMPLE_RATE: '0.5'
          }
        ).sampleRate,
        0.5,
        'should be 0.5 if defined as 0.5'
      )
      assert.equal(
        Honeycomb.parseEnv(
          'boltzmann', 
          { HONEYCOMB_SAMPLE_RATE: 'pony' }
        ).sampleRate,
        1,
        'should be 1 if not parseable'
      )
    })

    t.test('options.apiHost', async (assert: Test) => {
      assert.equal(
        Honeycomb.parseEnv('boltzmann', {}).apiHost,
        null,
        'should be null when no env var'
      )
      assert.equal(
        Honeycomb.parseEnv(
          'boltzmann',{
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
      const metadata = defaultOTLPFactories.metadata(
        'some write key',
        'some dataset'
      )
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
        defaultOTLPFactories.sampler(1) instanceof ParentBasedSampler,
        'sampler(1) should be a ParentBasedSampler'
      )
      assert.ok(
        defaultOTLPFactories.sampler(0) instanceof ParentBasedSampler,
        'sampler(0) should be a ParentBasedSampler'
      )
      assert.ok(
        defaultOTLPFactories.sampler(0.5) instanceof ParentBasedSampler,
        'sampler(0.5) should be a ParentBasedSampler'
      )
    })

    test('tracerProvider', async (assert: Test) => {
      const sampler = defaultOTLPFactories.sampler(1)
      assert.doesNotThrow(
        () => defaultOTLPFactories.tracerProvider(sampler),
        'should create a tracer provider'
      )
    })

    test('traceExporter', async (assert: Test) => {
      assert.doesNotThrow(() => {
        const url = 'grpc://example.com'
        const metadata = defaultOTLPFactories.metadata(
          'some write key',
          'some dataset'
        )

        defaultOTLPFactories.traceExporter(url, metadata)
      }, 'should create a trace exporter')
    })

    test('spanProcessor', async (assert: Test) => {
      assert.doesNotThrow(() => {
        const exporter = defaultOTLPFactories.traceExporter(
          'grpc://example.com',
          defaultOTLPFactories.metadata(
            'some write key',
            'some dataset'
          )
        )

        defaultOTLPFactories.spanProcessor(exporter)
      }, 'should create a span processor')
    })

    test('instrumentations', async (assert: Test) => {
      // expected instrumentations: dns, node core, postgres, redis
      assert.equal(
        defaultOTLPFactories.instrumentations().length,
        4,
        'should create 4 instrumentations (dns, http, postgres, redis)'
      )
    })

    test('sdk', async (assert: Test) => {
      // run the init function
      assert.doesNotThrow(() => {
        const exporter = defaultOTLPFactories.traceExporter(
          'grpc://example.com',
          defaultOTLPFactories.metadata(
            'some write key',
            'some dataset'
          )
        )
        const instrumentations = defaultOTLPFactories.instrumentations()
        defaultOTLPFactories.sdk('boltzmann', instrumentations, exporter)
      }, 'should create an sdk')
    })
  })
}

void `{% endif %}`
