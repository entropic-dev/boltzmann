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
2) Dependencies required for honeycomb but used generally should be at the
   TOP of this file and in the self-test block at the TOP of prelude.ts
2) Dependencies should be imported as *, to minimize the impact on the
   boltzmann namespace and make all the OpenTelemetry library exports
   accessible. Exceptions may be made for modules with only one meaningful
  import

Good luck!
#}*/

// Dependencies used downstream - it's worth your time to look at how these
// are treated in prelude.ts!
import isDev from 'are-we-dev'
import bole from '@entropic/bole'

// We continue to support beelines...
import beeline from 'honeycomb-beeline'

// ...but are migrating to OpenTelemetry:
import * as grpc from '@grpc/grpc-js'
import * as otel from '@opentelemetry/api'
import * as otelCore from '@opentelemetry/core'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'
import * as otelResources from '@opentelemetry/resources'
import { NodeSDK as OtelSDK } from '@opentelemetry/sdk-node'
import * as otelTraceBase from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import * as otelSemanticConventions from '@opentelemetry/semantic-conventions'

// We include node core instrumentation, as well as redis
// and postgres instrumentation if those respective features
// are enabled.
//
// Some instrumentation that is NOT included, because boltzmann
// doesn't support the technology:
//
// * @opentelemetry/instrumentation-grpc
// * @opentelemetry/instrumentation-graphql
//
// Some packages which, to our knowledge, don't have available
// instrumentations:
//
// * undici
//
import { Instrumentation as OtelInstrumentation } from '@opentelemetry/instrumentation'
import { DnsInstrumentation as OtelDnsInstrumentation } from '@opentelemetry/instrumentation-dns'
import { HttpInstrumentation as OtelHttpInstrumentation } from '@opentelemetry/instrumentation-http'

void `{% if redis %}`;
import { RedisInstrumentation as OtelRedisInstrumentation } from '@opentelemetry/instrumentation-redis'
void `{% endif %}`

void `{% if postgres %}`
import { PgInstrumentation as OtelPgInstrumentation } from '@opentelemetry/instrumentation-pg'
void `{% endif %}`

class HoneycombError extends Error {
}

// There's a bug in the trace base library where the SimpleSpanExporter doesn't
// actually conform to the SpanExporter interface! onStart in particular
// doesn't take the context argument. This makes typescript extremely
// cranky.
//
// We work around this by defining a new type which is the same as a
// SimpleSpanProcessor, but without enforcing onStart and onEnd. Then, we
// implement those methods as specified by the SpanProcessor interface.
type _OtelSpanProcessorClass = new(_exporter: otelTraceBase.SpanExporter) => {
  [P in Exclude<keyof otelTraceBase.SpanProcessor, 'onStart' | 'onEnd'>]: otelTraceBase.SpanProcessor[P]
}

const _OtelSpanProcessor: _OtelSpanProcessorClass = otelTraceBase.SimpleSpanProcessor

class HoneycombSpanProcessor extends _OtelSpanProcessor implements otelTraceBase.SpanProcessor {
  constructor(_exporter: otelTraceBase.SpanExporter) {
    super(_exporter)
  }

  // We want every span in the process to contain a couple of extra attributes.
  // Right now that's just service_name (for backwards compatibility with
  // beeline) and a trace type (so we can detect whether a service is using
  // beeline or otel). This could theoretically be extended to allow
  // customization a la beeline.addTraceContext, but that problem is really
  // hairy and there are a lot of good reasons to add most attributes to
  // just the active span.
  onStart(span: otelTraceBase.Span, _: otel.Context): void {
    span.setAttribute('service_name', span.resource.attributes['service.name'])
    span.setAttribute('boltzmann.honeycomb.trace_type', 'otel')

    otelTraceBase.SimpleSpanProcessor.prototype.onStart.call(this, span)
  }

  onEnd(span: otelTraceBase.ReadableSpan): void {
    otelTraceBase.SimpleSpanProcessor.prototype.onEnd.call(this, span)
  }
}

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
interface OtelFactories {
  metadata: (writeKey: string, dataset: string) => grpc.Metadata
  sampler: (sampleRate: number) => otel.Sampler
  resource: (serviceName: string) => otelResources.Resource
  tracerProvider: (
    resource: otelResources.Resource,
    sampler: otel.Sampler
  ) => NodeTracerProvider
  traceExporter: (url: string, metadata: grpc.Metadata) => OTLPTraceExporter
  spanProcessor: (traceExporter: OTLPTraceExporter) => otelTraceBase.SpanProcessor
  instrumentations: () => OtelInstrumentation[]
  sdk: (
    resource: otelResources.Resource,
    instrumentations: OtelInstrumentation[],
    traceExporter: OTLPTraceExporter
  ) => OtelSDK
}

const defaultOtelFactories: OtelFactories = {
  metadata (writeKey: string, dataset: string): grpc.Metadata {
    const metadata = new grpc.Metadata()
    metadata.set('x-honeycomb-team', writeKey)
    metadata.set('x-honeycomb-dataset', dataset)
    return metadata
  },

  // create a Sampler object, which is used to tune
  // the sampling rate
  sampler (sampleRate: number): otel.Sampler {
    return new otelCore.ParentBasedSampler({
      root: new otelCore.TraceIdRatioBasedSampler(sampleRate)
    })
  },

  resource (serviceName: string): otelResources.Resource {
    return new otelResources.Resource({
      [otelSemanticConventions.SemanticResourceAttributes.SERVICE_NAME]: serviceName
    })
  },

  // It provides tracers!
  tracerProvider (resource: otelResources.Resource, sampler: otel.Sampler): NodeTracerProvider {
    return new NodeTracerProvider({ resource, sampler })
  },

  // Export traces to an OTLP endpoint with GRPC
  traceExporter (url: string, metadata: grpc.Metadata): OTLPTraceExporter {
    return new OTLPTraceExporter({
      url,
      credentials: grpc.credentials.createSsl(),
      metadata
    })
  },

  // Process spans, using the supplied trace exporter to
  // do the actual exporting.
  spanProcessor (traceExporter: OTLPTraceExporter): otelTraceBase.SpanProcessor {
    return new HoneycombSpanProcessor(traceExporter)
  },

  instrumentations () {
    // Any paths we add here will get no traces whatsoever. This is
    // appropriate for the ping route, which should never trace.
    const ignoreIncomingPaths = [
      '/monitor/ping'
    ]

    // OpenTelemetry attempts to auto-collect GCE metadata, causing traces
    // we don't care about. We do our best to ignore them by independently
    // calculating which endpoints it's going to try to call.
    //
    // See: https://github.com/googleapis/gcp-metadata/blob/main/src/index.ts#L26-L44
    const ignoreOutgoingUrls = [
      /^https?:\/\/169\.254\.169\.254/,
      /^https?:\/\/metadata\.google\.internal/,
    ]
    let gceBase: string | null = process.env.GCE_METADATA_IP || process.env.GCE_METADATA_HOST || null
    if (gceBase) {
      if (!/^https?:\/\//.test(gceBase)) {
        gceBase = `http://${gceBase}`;
      }
      ignoreOutgoingUrls.push(new RegExp(`^${gceBase}`))
    }

    let is: OtelInstrumentation[] = [
      new OtelDnsInstrumentation({}),
      // NOTE: This instrumentation creates the default "trace" span and manages
      // header propagation! See the honeycomb trace middleware for more
      // details.
      new OtelHttpInstrumentation({
        // TODO: These fields are expected to become deprecated in the
        // near future...
        ignoreIncomingPaths,
        ignoreOutgoingUrls
      }),
    ]

    void `{% if redis %}`
    is.push(new OtelRedisInstrumentation({}))
    void `{% endif %}`

    void `{% if postgres %}`
    is.push(new OtelPgInstrumentation({}))
    void `{% endif %}`

    return is
  },

  // The SDK will take a service name, instrumentations
  // and a trace exporter and give us a stateful singleton.
  // This is that singleton!
  sdk (
    resource: otelResources.Resource,
    instrumentations: OtelInstrumentation[],
    traceExporter: OTLPTraceExporter
  ): OtelSDK {
    return new OtelSDK({
      resource,
      traceExporter,
      instrumentations
    })
  }
}

// For testing purposes, it can be beneficial to
// override how objects in OpenTelemetry initialization
// are created. The Honeycomb class allows for
// passing overrides into its constructor.
interface OtelFactoryOverrides {
  metadata?: (writeKey: string, dataset: string) => grpc.Metadata
  sampler?: (sampleRate: Number) => otel.Sampler
  resource?: (serviceName: string) => otelResources.Resource
  tracerProvider?: (
    resource: otelResources.Resource,
    sampler: otel.Sampler
  ) => NodeTracerProvider
  traceExporter?: (url: string, metadata: grpc.Metadata) => OTLPTraceExporter
  spanProcessor?: (traceExporter: OTLPTraceExporter) => otelTraceBase.SpanProcessor
  instrumentations?: () => OtelInstrumentation[];
  sdk?: (
    resource: otelResources.Resource,
    instrumentations: OtelInstrumentation[],
    traceExporter: OTLPTraceExporter
  ) => OtelSDK;
}

// Let's GOOOOOOO
class Honeycomb {
  public options: HoneycombOptions
  public features: HoneycombFeatures
  public factories: OtelFactories

  public tracerProvider: NodeTracerProvider | null
  public traceExporter: OTLPTraceExporter | null
  public spanProcessor: otelTraceBase.SpanProcessor | null
  public instrumentations: OtelInstrumentation[] | null
  public sdk: OtelSDK | null

  public initialized: boolean
  public started: boolean

  public logger: typeof bole | null

  constructor(
    options: HoneycombOptions,
    overrides: OtelFactoryOverrides = {}
  ) {
    this.options = options
    this.features = {
      honeycomb: !options.disable,
      beeline: !options.disable && !options.otel,
      otel: options.otel || false
    }
    this.initialized = false
    this.started = false

    this.tracerProvider = null
    this.traceExporter = null
    this.spanProcessor = null
    this.instrumentations = null
    this.sdk = null

    this.factories = {
      ...defaultOtelFactories,
      ...(overrides || {})
    }

    this.logger = null
  }

  get tracer (): otel.Tracer {
    // TODO: Can we do better than hard-coding 1.0.0?
    return otel.trace.getTracer('boltzmann', '1.0.0')
  }

  // We (usually) load options from the environment. Unlike with Options,
  // we do a lot of feature detection here.
  public static fromEnv(
    serviceName: string,
    env: typeof process.env = process.env,
    overrides: OtelFactoryOverrides = {}
  ): Honeycomb {
    return new Honeycomb(
      Honeycomb.parseEnv(serviceName, env),
      overrides
    )
  }

  // serviceName is defined in the prelude, so rather than doing the same
  // logic twice we let the prelude inject it when creating the honeycomb
  // object.
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
      Honeycomb.log(
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

  // Initialize Honeycomb! Stands up the otel node SDK if enabled,
  // otherwise sets up the beeline library.
  // This needs to occur before any imports you want instrumentation
  // to be aware of. This step is separated from the constructor if only because
  // there are irreversible side effects galore.
  public init(): void {
    if (!this.features.honeycomb) {
      this.initialized = true
      return
    }
    try {
      const writeKey = this.writeKey
      const dataset = this.dataset
      const sampleRate = this.options.sampleRate || 1
      const serviceName = this.options.serviceName

      if (!this.features.otel) {
        beeline({ writeKey, dataset, sampleRate, serviceName })
        this.initialized = true
        return
      }

      const f = this.factories
      const apiHost: string = this.apiHost

      const metadata: grpc.Metadata = f.metadata(writeKey, dataset)
      const resource: otelResources.Resource = f.resource(serviceName)

      const sampler: otel.Sampler = f.sampler(sampleRate)
      const exporter = f.traceExporter(apiHost, metadata)
      const processor = f.spanProcessor(exporter)
      const instrumentations = f.instrumentations()

      const provider: NodeTracerProvider = f.tracerProvider(resource, sampler)
      provider.addSpanProcessor(processor)
      provider.register()

      const sdk = f.sdk(
        resource,
        instrumentations,
        exporter
      )

      this.traceExporter = exporter
      this.spanProcessor = processor
      this.instrumentations = instrumentations
      this.tracerProvider = provider

      this.sdk = sdk

      this.initialized = true
    } catch (err) {
      if (err instanceof HoneycombError) {
        this.log(err);
        return;
      }
      throw err;
    }
  }

  // Start the OpenTelemetry SDK. If using beelines, this is
  // a no-op. This needs to happen before anything happens in
  // the entrypoint and is an async operation.
  public async start(): Promise<void> {
    let exitCode = 0
    const sdk = this.sdk

    const die = async (err: Error) => {
      this.log(err);
      exitCode = 1
      await shutdown()
    }

    const shutdown = async () => {
      await this.stop()
      process.exit(exitCode)
    }

    if (sdk) {
      process.once('SIGTERM', shutdown)
      process.once('beforeExit', shutdown)
      process.once('uncaughtException', die)
      process.once('unhandledRejection', async (reason: Error | any, _: Promise<any>) => {
        await die(reason)
      })
      await sdk.start()
    }
    this.started = true
  }

  public async stop(): Promise<void> {
    const sdk = this.sdk
    if (!sdk) return
    try {
      await sdk.shutdown()
    } catch (err) {
      this.log(err)
    }
  }

  // These accessors are type guards that ensure you're working
  // with a defined/non-null property. It's a bit of 6-to-1 and
  // half a dozen on the other, because you trade ifs for
  // try/catches and honeycomb can basically never throw. Even
  // so, it saves a little bit of boilerplate.
  public get writeKey (): string {
    if (this.options.writeKey) {
      return this.options.writeKey
    }
    throw new HoneycombError('HONEYCOMB_WRITEKEY is undefined!')
  }

  public get dataset () {
    if (this.options.dataset) {
      return this.options.dataset
    }
    throw new HoneycombError('HONEYCOMB_DATASET is undefined!')
  }

  public get apiHost () {
    if (this.options.apiHost) {
      return this.options.apiHost
    }
    throw new HoneycombError('HONEYCOMB_API_HOST is undefined!')
  }

  // We *do* have a handful of logging use cases...

  public static log(message: string | Error): void {
    // Honeycomb starts up very early in the process's lifetime and
    // can't count on bole being configured. In those cases, we fall
    // back to console.log and JSON.stringify. Only use this if you
    // can't use a bole logger!

    // We always log at the debug level, in an effort to make tracing as quiet
    // as possible while still being stdout-debuggable. We also mute them
    // during unit tests.
    let isDebug = !process.env.LOG_LEVEL || process.env.LOG_LEVEL === 'debug'

    void `{% if selftest %}`
      isDebug = false
    void `{% endif %}`

    if (isDebug) {
      const line: any = {
        time: (new Date()).toISOString(),
        level: 'debug',
        name: 'boltzmann:honeycomb'
      }

      if (message instanceof Error) {
        line.err = {
          name: message.name,
          message: message.message,
          stack: String(message.stack)
        }
      } else {
        line.message = message
      }

      console.log(JSON.stringify(line))
    }
  }

  public log(message: string | Error): void {
    // The logger middleware creates a logger on the honeycomb object. If it's
    // in place, we'll gladly use it.
    if (this.logger) {
      this.logger.debug(message)
      return
    }

    // Otherwise, fall back to console.log + JSON.stringify
    Honeycomb.log(message)
  }
}

export {
  beeline,
  bole,
  grpc,
  isDev,
  otel,
  otelCore,
  OTLPTraceExporter,
  otelResources,
  OtelSDK,
  otelTraceBase,
  NodeTracerProvider,
  otelSemanticConventions,
  OtelInstrumentation,
  OtelDnsInstrumentation,
  OtelHttpInstrumentation,
  // {% if redis %}
  OtelRedisInstrumentation,
  // {% endif %}
  // {% if postgres %}
  OtelPgInstrumentation
  // {% endif %}
}

export {
  defaultOtelFactories,
  Honeycomb,
  HoneycombError,
  HoneycombOptions,
  HoneycombFeatures,
  HoneycombSpanProcessor,
  OtelFactories,
  OtelFactoryOverrides,
}

void `{% if selftest %}`

class OtelMockSpanProcessor extends HoneycombSpanProcessor {
  public _exporterCreatedSpans: otelTraceBase.ReadableSpan[] = []

  constructor(_exporter: otelTraceBase.SpanExporter) {
    super(_exporter)
    this._exporterCreatedSpans = []
  }

  onEnd(span: otelTraceBase.ReadableSpan): void {
    // don't call super's onEnd, if only because it mysteriously causes
    // sdk startup to time out in test

    // note that this collects spans as they *close*, meaning a parent span
    // will be *behind* its children
    this._exporterCreatedSpans.push(span)
  }
}

function getOtelMockSpans(spanProcessor: otelTraceBase.SpanProcessor | null): otelTraceBase.ReadableSpan[] {
  const processor: any = spanProcessor

  if (!processor) {
    throw new Error(
      'Span processor is not defined - did you initialize honeycomb?'
    )
  }

  if (!processor._exporterCreatedSpans) {
    throw new Error(
      'Span processor is not an OtelMockSpanProcessor'
    )
  }

  return <otelTraceBase.ReadableSpan[]>(processor._exporterCreatedSpans)
}

function resetOtelMockSpans(spanProcessor: otelTraceBase.SpanProcessor | null): void {
  const processor: any = spanProcessor

  if (!processor) {
    throw new Error(
      'Span processor is not defined - did you initialize honeycomb?'
    )
  }

  if (!processor._exporterCreatedSpans) {
    throw new Error(
      'Span processor is not an OtelMockSpanProcessor'
    )
  }

  processor._exporterCreatedSpans = []
}

function createMockHoneycomb(): Honeycomb {
  return new Honeycomb(
    {
      serviceName: 'test-app',
      disable: false,
      otel: true,
      writeKey: 'SOME_WRITEKEY',
      dataset: 'SOME_DATASET',
      apiHost: 'grpc://otel.website:9000',
      sampleRate: 1
    },
    {
      spanProcessor(traceExporter) {
        return new OtelMockSpanProcessor(traceExporter)
      }
    }
  )
}

export {
  createMockHoneycomb,
  getOtelMockSpans,
  OtelMockSpanProcessor,
  resetOtelMockSpans
}

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
    t.test('metadata', async (assert: Test) => {
      const metadata = defaultOtelFactories.metadata(
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

    t.test('resource', async (assert: Test) => {
      assert.doesNotThrow(() => defaultOtelFactories.resource('test-service'))
    })

    t.test('sampler', async (assert: Test) => {
      assert.ok(
        defaultOtelFactories.sampler(1) instanceof otelCore.ParentBasedSampler,
        'sampler(1) should be a otelCore.ParentBasedSampler'
      )
      assert.ok(
        defaultOtelFactories.sampler(0) instanceof otelCore.ParentBasedSampler,
        'sampler(0) should be a otelCore.ParentBasedSampler'
      )
      assert.ok(
        defaultOtelFactories.sampler(0.5) instanceof otelCore.ParentBasedSampler,
        'sampler(0.5) should be a otelCore.ParentBasedSampler'
      )
    })

    test('tracerProvider', async (assert: Test) => {
      const sampler = defaultOtelFactories.sampler(1)
      const resource = defaultOtelFactories.resource('test-service')
      assert.doesNotThrow(
        () => defaultOtelFactories.tracerProvider(resource, sampler),
        'should create a tracer provider'
      )
    })

    test('traceExporter', async (assert: Test) => {
      const url = 'grpc://otel.website:9000'
      const metadata = defaultOtelFactories.metadata(
        'some write key',
        'some dataset'
      )

      const exporter = defaultOtelFactories.traceExporter(url, metadata)
      assert.equal(exporter.url, 'otel.website:9000')
    })

    test('spanProcessor', async (assert: Test) => {
      assert.doesNotThrow(() => {
        const exporter = defaultOtelFactories.traceExporter(
          'grpc://example.com',
          defaultOtelFactories.metadata(
            'some write key',
            'some dataset'
          )
        )

        defaultOtelFactories.spanProcessor(exporter)
      }, 'should create a span processor')
    })

    test('instrumentations', async (assert: Test) => {
      // expected instrumentations: dns, node core, postgres, redis
      assert.equal(
        defaultOtelFactories.instrumentations().length,
        4,
        'should create 4 instrumentations (dns, http, postgres, redis)'
      )
    })

    test('sdk', async (assert: Test) => {
      // run the init function
      assert.doesNotThrow(() => {
        const resource = defaultOtelFactories.resource('test-service')
        const exporter = defaultOtelFactories.traceExporter(
          'grpc://example.com',
          defaultOtelFactories.metadata(
            'some write key',
            'some dataset'
          )
        )
        const instrumentations = defaultOtelFactories.instrumentations()
        defaultOtelFactories.sdk(resource, instrumentations, exporter)
      }, 'should create an sdk')
    })
  })

  test('init and start', async (assert: Test) => {
    const honeycomb = createMockHoneycomb()

    honeycomb.init()

    assert.same(honeycomb.traceExporter?.url, 'otel.website:9000')

    assert.doesNotThrow(async () => {
      await honeycomb.start()
      await honeycomb.stop()
    })
  })
}

void `{% endif %}`
