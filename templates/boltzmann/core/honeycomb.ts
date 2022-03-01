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
import { Writable } from 'stream'
import bole from '@entropic/bole'
import isDev from 'are-we-dev'

// We continue to support beelines...
import beeline from 'honeycomb-beeline'

// ...but are migrating to OpenTelemetry:
import * as grpc from '@grpc/grpc-js'
import * as otel from '@opentelemetry/api'
import * as otelCore from '@opentelemetry/core'
import * as otlpHttp from '@opentelemetry/exporter-trace-otlp-http'
import * as otlpProto from '@opentelemetry/exporter-trace-otlp-proto'
import * as otlpGrpc from '@opentelemetry/exporter-trace-otlp-grpc'
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

// A diagnostic logger for OpenTelemetry. To log at a sensible level,
// call otel.diag.verbose.
class HoneycombDiagLogger implements otel.DiagLogger {
  public logger?: typeof bole
  private _stream: Writable

  // OpenTelemetry's diagnostic logger has one more log level than bole - ie,
  // verbose.
  //
  // For more details on how to treat each log level, see:
  // https://github.com/open-telemetry/opentelemetry-js-api/blob/main/src/diag/consoleLogger.ts#L60

  // Log errors that caused an unexpected failure
  error(message: string, ...args: unknown[]): void {
    this._log('error', message, args)
  }
  // Log warnings that aren't show-stopping but should REALLY be looked at
  warn(message: string, ...args: unknown[]): void {
    this._log('warn', message, args)
  }
  // Log info if you want to be REALLY LOUD for some reason - you probably
  // don't want to use this!
  info(message: string, ...args: unknown[]): void {
    this._log('info', message, args)
  }
  // Log details that could be useful for identifying what went wrong, but
  // aren't the thing that went wrong itself - treat this as you would info
  // logging normally
  debug(message: string, ...args: unknown[]): void {
    this._log('debug', message, args)
  }
  // Log fine-grained details that are mostly going to be useful to those
  // adding new OpenTelemetry related features to boltzmann - treat this like
  // you would debug level logging normally
  verbose(message: string, ...args: unknown[]): void {
    this._log('debug', `VERBOSE: ${message}`, args)
  }

  // Ideally we would log to a bole logger. However, logger setup happens
  // relatively late - in the log middleware - and it's very likely that such
  // a log won't be in-place when we stand up the middleware stack! Therefore,
  // we do log to bole if it's set in the middleware but will fall back to
  // good ol' fashioned JSON.stringify if need be.
  constructor() {
    this._stream = process.stdout

    // So log messages roughly match what's output by the bole in dev mode :^)
    if (isDev()) {
      const pretty = require('bistre')({ time: true })
      this._stream = pretty.pipe(this._stream)
    }
  }

  private _log(level: 'error' | 'warn' | 'info' | 'debug', message: string, args: unknown[]): void {
    let isSelfTest = false
    void `{% if selftest %}`
    isSelfTest = true
    void `{% endif %}`
    if (isSelfTest) {
      return
    }

    // Log to bole if we have it
    if (this.logger) {
      this.logger[level](message, ...args)
      return
    }

    const line: any = {
      time: (new Date()).toISOString(),
      level,
      name: 'boltzmann:honeycomb',
      message,
      args
    }

    try {
      // are the args JSON-serializable?
      this._writeLine(JSON.stringify(line))
      // SURVEY SAYS...
    } catch (_) {
      // ...ok, make it a string as a fallback
      line.args = require('util').format('%o', line.args)
      this._writeLine(JSON.stringify(line))
    }
  }

  private _writeLine(line: string): void {
      this._stream.write(Buffer.from(line + '\n'))
  }

}

// We only do OpenTelemetry logging if boltzmann's main log level is debug
const _diagLogger = new HoneycombDiagLogger()

if (!process.env.LOG_LEVEL || process.env.LOG_LEVEL === 'debug') {
  otel.diag.setLogger(_diagLogger, otelCore.getEnv().OTEL_LOG_LEVEL)
}

// There's a bug in the trace base library where the SimpleSpanProcessor doesn't
// actually conform to the SpanProcessor interface! onStart in particular
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

type HoneycombOTLPHeaders = {
  'x-honeycomb-team': string,
  'x-honeycomb-dataset': string
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

  // Tunables, etc.
  sampleRate?: number
  otlpProtocol?: string
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
  headers: (writeKey: string, dataset: string) => HoneycombOTLPHeaders
  sampler: (sampleRate: number) => otel.Sampler
  resource: (serviceName: string) => otelResources.Resource
  tracerProvider: (
    resource: otelResources.Resource,
    sampler: otel.Sampler
  ) => NodeTracerProvider
  spanExporter: (protocol: string, headers: HoneycombOTLPHeaders) => otelTraceBase.SpanExporter
  spanProcessor: (spanExporter: otelTraceBase.SpanExporter) => otelTraceBase.SpanProcessor
  instrumentations: () => OtelInstrumentation[]
  sdk: (
    resource: otelResources.Resource,
    instrumentations: OtelInstrumentation[]
  ) => OtelSDK
}

const defaultOtelFactories: OtelFactories = {
  headers (writeKey: string, dataset: string): HoneycombOTLPHeaders {
    return {
      'x-honeycomb-team': writeKey,
      'x-honeycomb-dataset': dataset
    }
  },

  // Create a Sampler object, which is used to tune
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

  // A tracer provider is effectively a Tracer factory and is used to power
  // the otel.getTrace API
  tracerProvider (resource: otelResources.Resource, sampler: otel.Sampler): NodeTracerProvider {
    return new NodeTracerProvider({ resource, sampler })
  },

  // There are three different OTLP span exporter classes - one for grpc, one
  // for http/protobuf and one for http/json - this will return the appropriate
  // one for the configured protocol.
  spanExporter (protocol: string, headers: HoneycombOTLPHeaders): otelTraceBase.SpanExporter {
    // Instead of subclassing each implementation, monkey patch the send
    // method on whichever instance we create
    function patchSend(exporter: any) {
      const send = exporter.send

      exporter.send = function(
        objects: otelTraceBase.ReadableSpan[],
        onSuccess: () => void,
        // This error is actually an Error subtype which corresponds 1:1 with
        // the OTLPTraceExporter class being instrumented, but making this a
        // proper generic type is hard - it's fine!
        onError: (error: any) => void
      ) {
        otel.diag.debug(`sending ${objects.length} spans to ${this.url}`)
        send.call(this,
          objects,
          () => {
            otel.diag.debug(`successfully send ${objects.length} spans to ${this.url}`)
            return onSuccess()
          },
          (error: any) => {
            otel.diag.debug(`error while sending ${objects.length} spans: ${error}`)
            return onError(error)
          }
        )
      }
    }

    if (protocol === 'grpc') {
      const metadata = new grpc.Metadata()
      metadata.set('x-honeycomb-team', headers['x-honeycomb-team'])
      metadata.set('x-honeycomb-dataset', headers['x-honeycomb-dataset'])
      const credentials = grpc.credentials.createSsl()

      const exporter = new otlpGrpc.OTLPTraceExporter({
        credentials,
        metadata
      })

      patchSend(exporter)

      return exporter
    }

    if (protocol === 'http/json') {
      otel.diag.warn(
        "Honeycomb doesn't support the http/json OTLP protocol - but if you say so"
      )
      const exporter = new otlpHttp.OTLPTraceExporter({
        headers
      })

      patchSend(exporter)

      return exporter
    }

    if (protocol !== 'http/protobuf') {
      otel.diag.warn(
        `Unknown OTLP protocol ${protocol} - using http/protobuf instead`
      )
    }

    const exporter = new otlpHttp.OTLPTraceExporter({
      headers
    })

    patchSend(exporter)

    return exporter
  },

  // Process spans, using the supplied trace exporter to
  // do the actual exporting.
  spanProcessor (spanExporter: otelTraceBase.SpanExporter): otelTraceBase.SpanProcessor {
    return new HoneycombSpanProcessor(spanExporter)
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
    instrumentations: OtelInstrumentation[]
  ): OtelSDK {
    return new OtelSDK({
      resource,
      instrumentations
    })
  }
}

// For testing purposes, it can be beneficial to
// override how objects in OpenTelemetry initialization
// are created. The Honeycomb class allows for
// passing overrides into its constructor.
interface OtelFactoryOverrides {
  headers?: (writeKey: string, dataset: string) => HoneycombOTLPHeaders
  sampler?: (sampleRate: Number) => otel.Sampler
  resource?: (serviceName: string) => otelResources.Resource
  tracerProvider?: (
    resource: otelResources.Resource,
    sampler: otel.Sampler
  ) => NodeTracerProvider
  spanExporter?: (protocol: string, headers: HoneycombOTLPHeaders) => otelTraceBase.SpanExporter
  spanProcessor?: (spanExporter: otelTraceBase.SpanExporter) => otelTraceBase.SpanProcessor
  instrumentations?: () => OtelInstrumentation[]
  sdk?: (
    resource: otelResources.Resource,
    instrumentations: OtelInstrumentation[],
  ) => OtelSDK;
}

// Let's GOOOOOOO
class Honeycomb {
  public options: HoneycombOptions
  public features: HoneycombFeatures
  public factories: OtelFactories

  public tracerProvider: NodeTracerProvider | null
  public spanExporter: otelTraceBase.SpanExporter | null
  public spanProcessor: otelTraceBase.SpanProcessor | null
  public instrumentations: OtelInstrumentation[] | null
  public sdk: OtelSDK | null

  public initialized: boolean
  public started: boolean

  private _logger: typeof bole | null

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
    this.spanExporter = null
    this.spanProcessor = null
    this.instrumentations = null
    this.sdk = null

    this.factories = {
      ...defaultOtelFactories,
      ...(overrides || {})
    }

    this._logger = null
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
    // The bare minimum requirement for honeycomb tracing is the write key
    const disable = !env.HONEYCOMB_WRITEKEY

    // Beelines should pick these up automatically, but we'll need them to
    // configure OTLP headers
    const writeKey = env.HONEYCOMB_WRITEKEY || null
    const dataset = env.HONEYCOMB_DATASET || null

    // OpenTelemetry is configured with a huge pile of `OTEL_*` environment
    // variables. If any of them are defined, we'll use OpenTelemetry instead
    // of beelines.
    //
    // For a broad overview of common variables, see:
    // https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/sdk-environment-variables.md
    //
    // For a list of variables the OTLP exporter respects, see:
    // https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-core/src/utils/environment.ts#L117-L122
    const isOtel: boolean = Object.entries(env).some(([name, value]) => {
      return name.startsWith('OTEL_') && value && value.length;
    });

    // beelines don't have a standard environment variable for configuring
    // the sample rate. OpenTelemetry has *some* mechanisms for configuring
    // samplers but are "involved." Therefore, this variable gets passed to
    // both beelines and the OpenTelemetry Sampler.
    let sampleRate: number = Number(env.HONEYCOMB_SAMPLE_RATE || 1)

    if (isNaN(sampleRate)) {
      otel.diag.verbose(
        `Unable to parse HONEYCOMB_SAMPLE_RATE=${env.HONEYCOMB_SAMPLE_RATE}, `
        + 'defaulting to 1'
      )
      sampleRate = 1
    }

    // OTLP is supposed to be configured with this environment variable, but
    // the OpenTelemetry SDKs leave this as a some-assembly-required job.
    // We default to 'http/protobuf' because it's well-supported by both
    // Honeycomb and AWS load balancers and because it's relatively snappy.
    //
    // For more information on how this is configured, see:
    // https://opentelemetry.io/docs/reference/specification/protocol/exporter/#specify-protocol
    const otlpProtocol = env.OTEL_EXPORTER_OTLP_PROTOCOL || env.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL || 'http/protobuf'

    return {
      serviceName,
      disable,
      otel: isOtel,
      writeKey,
      dataset,
      sampleRate,
      otlpProtocol
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
      const sampleRate = this.sampleRate
      const serviceName = this.serviceName

      if (this.features.beeline) {
        beeline({ writeKey, dataset, sampleRate, serviceName })
        return
      }

      const f = this.factories

      const headers: HoneycombOTLPHeaders = f.headers(writeKey, dataset)
      const resource: otelResources.Resource = f.resource(serviceName)

      const sampler: otel.Sampler = f.sampler(sampleRate)
      const exporter = f.spanExporter(this.options.otlpProtocol || 'http/protobuf', headers)
      const processor = f.spanProcessor(exporter)
      const instrumentations = f.instrumentations()

      const provider: NodeTracerProvider = f.tracerProvider(resource, sampler)
      provider.addSpanProcessor(processor)
      provider.register()

      const sdk = f.sdk(
        resource,
        instrumentations,
      )

      this.spanExporter = exporter
      this.spanProcessor = processor
      this.instrumentations = instrumentations
      this.tracerProvider = provider

      this.sdk = sdk

      this.initialized = true
    } catch (err) {
      if (err instanceof HoneycombError) {
        otel.diag.error(err.stack || String(err));
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
      otel.diag.error(err.stack || String(err));
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
      otel.diag.error(err.stack || String(err))
    }
  }

  public get writeKey (): string {
    if (this.options.writeKey) {
      return this.options.writeKey
    }
    throw new HoneycombError('HONEYCOMB_WRITEKEY is undefined!')
  }

  public get dataset (): string {
    // The beeline default, here for OpenTelemetry's benefit
    return this.options.dataset || "nodejs"
  }

  public get sampleRate (): number {
    return this.options.sampleRate || 1
  }

  public get serviceName (): string {
    return this.options.serviceName || 'boltzmann'
  }

  public get logger (): typeof bole | null {
    return this._logger
  }

  public set logger (logger: typeof bole | null) {
    this._logger = logger
    _diagLogger.logger = logger ? logger : undefined
  }
}

export {
  beeline,
  bole,
  otel,
  otelCore,
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
  HoneycombFeatures,
  HoneycombOptions,
  HoneycombOTLPHeaders,
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
  process.env.OTEL_LOG_LEVEL = 'error'
  return new Honeycomb(
    {
      serviceName: 'test-app',
      disable: false,
      otel: true,
      writeKey: 'SOME_WRITEKEY',
      dataset: 'SOME_DATASET',
      sampleRate: 1
    },
    {
      spanProcessor(spanExporter) {
        return new OtelMockSpanProcessor(spanExporter)
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
        Honeycomb.parseEnv(
          'boltzmann',
          {
            HONEYCOMB_WRITEKEY: '',
            HONEYCOMB_API_HOST: 'https://refinery.tech'
          }
        ).otel,
        false,
        'should not use otel when only beeline variables are set'
      )
      assert.equal(
        Honeycomb.parseEnv(
          'boltzmann',
          {
            HONEYCOMB_WRITEKEY: 'some write key',
            OTEL_EXPORTER_OTLP_ENDPOINT: 'https://refinery.website'
          }
        ).otel,
        true,
        'should use otel when OTEL_EXPORTER_OTLP_ENDPOINT is defined'
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
  })
  test('factories', async (t: Test) => {
    t.test('headers', async (assert: Test) => {
      const headers = defaultOtelFactories.headers(
        'some write key',
        'some dataset'
      )

      assert.same(
        headers,
        {
          'x-honeycomb-team': 'some write key',
          'x-honeycomb-dataset': 'some dataset'
        },
        'should have the expected headers'
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

    test('spanExporter', async (assert: Test) => {
      const headers = defaultOtelFactories.headers(
        'some write key',
        'some dataset'
      )

      process.env.OTEL_LOG_LEVEL = 'error'

      for (let protocol of ['grpc', 'http/protobuf', 'http/json']) {
        assert.doesNotThrow(() => {
          defaultOtelFactories.spanExporter(protocol, headers)
        })
      }
    })

    test('spanProcessor', async (assert: Test) => {
      assert.doesNotThrow(() => {
        const exporter = defaultOtelFactories.spanExporter(
          'http/protobuf',
          defaultOtelFactories.headers(
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
        const instrumentations = defaultOtelFactories.instrumentations()

        defaultOtelFactories.sdk(
          resource, 
          instrumentations,
        )
      }, 'should create an sdk')
    })
  })

  test('init and start', async (assert: Test) => {
    const honeycomb = createMockHoneycomb()

    honeycomb.init()

    assert.doesNotThrow(async () => {
      await honeycomb.start()
      await honeycomb.stop()
    })
  })
}

void `{% endif %}`
