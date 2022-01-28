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

// We continue to support beelines...
import beeline from 'honeycomb-beeline'

// ...but are migrating to OpenTelemetry:
import * as grpc from '@grpc/grpc-js'
import * as otlpAPI from '@opentelemetry/api'
import * as otlpCore from '@opentelemetry/core'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'
import * as otlpResources from '@opentelemetry/resources'
import { NodeSDK as OtlpSDK } from '@opentelemetry/sdk-node'
import * as otlpTraceBase from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import * as otlpSemanticConventions from '@opentelemetry/semantic-conventions'

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
import { Instrumentation as OtlpInstrumentation } from '@opentelemetry/instrumentation'
import { DnsInstrumentation as OtlpDnsInstrumentation } from '@opentelemetry/instrumentation-dns'
import { HttpInstrumentation as OtlpHttpInstrumentation } from '@opentelemetry/instrumentation-http'

void `{% if redis %}`;
import { RedisInstrumentation as OtlpRedisInstrumentation } from '@opentelemetry/instrumentation-redis'
void `{% endif %}`

void `{% if postgres %}`
import { PgInstrumentation as OtlpPgInstrumentation } from '@opentelemetry/instrumentation-pg'
void `{% endif %}`


// TODO: Sort through these and find a good answer
void `{% if selftest %}`
import { ServerResponse } from 'http'

import { Context } from '../data/context'
import { Handler } from './middleware'

void `{% endif %}`

class HoneycombError extends Error {
}

// Arguments passed to Honeycomb's constructor
interface HoneycombOptions {
  serviceName: string
  // When true, treat Honeycomb instrumentation as
  // disabled
  disable?: boolean

  // When true, Do Otlp
  otlp?: boolean

  // The Honeycomb write key and dataset
  writeKey?: string | null
  dataset?: string | null

  // If using OpenTelemetry, this is a grpc:// address
  apiHost?: string | null

  // Tunables, etc.
  sampleRate?: number
}

// Whether or not otlp, beelines and honeycomb are enabled
interface HoneycombFeatures {
  honeycomb: boolean
  beeline: boolean
  otlp: boolean
}

// There's a lot of plumbing that happens when setting up
// OpenTelemetry. In order to fully initialize it, we need
// to instantiate all of these object types.
//
// They're exposed on the Honeycomb class but in a nested
// namespace.
interface OTLPFactories {
  metadata: (writeKey: string, dataset: string) => grpc.Metadata
  sampler: (sampleRate: number) => otlpAPI.Sampler
  tracerProvider: (sampler: otlpAPI.Sampler) => NodeTracerProvider
  traceExporter: (url: string, metadata: grpc.Metadata) => OTLPTraceExporter
  spanProcessor: (traceExporter: OTLPTraceExporter) => otlpTraceBase.SpanProcessor
  instrumentations: () => OtlpInstrumentation[]
  sdk: (
    serviceName: string,
    instrumentations: OtlpInstrumentation[],
    traceExporter: OTLPTraceExporter
  ) => OtlpSDK
}

const defaultOtlpFactories: OTLPFactories = {
  metadata (writeKey: string, dataset: string): grpc.Metadata {
    const metadata = new grpc.Metadata()
    metadata.set('x-honeycomb-team', writeKey)
    metadata.set('x-honeycomb-dataset', dataset)
    return metadata
  },

  // create a Sampler object, which is used to tune
  // the sampling rate
  sampler (sampleRate: number): otlpAPI.Sampler {
    return new otlpCore.ParentBasedSampler({
      root: new otlpCore.TraceIdRatioBasedSampler(sampleRate)
    })
  },

  // It provides tracers!
  tracerProvider (sampler: otlpAPI.Sampler): NodeTracerProvider {
    return new NodeTracerProvider({ sampler })
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
  spanProcessor (traceExporter: OTLPTraceExporter): otlpTraceBase.SpanProcessor {
    // There's a bug in the types here - SimpleSpanProcessor doesn't
    // take the optional Context argument in its signature and
    // typescript is understandably cranky about that.
    return <otlpTraceBase.SpanProcessor>(new otlpTraceBase.SimpleSpanProcessor(traceExporter) as unknown)
  },

  instrumentations () {
    let is: OtlpInstrumentation[] = [
      new OtlpDnsInstrumentation({}),
      new OtlpHttpInstrumentation({}),
    ]

    void `{% if redis %}`
    is.push(new OtlpRedisInstrumentation({}))
    void `{% endif %}`

    void `{% if postgres %}`
    is.push(new OtlpPgInstrumentation({}))
    void `{% endif %}`

    return is
  },

  // The SDK will take a service name, instrumentations
  // and a trace exporter and give us a stateful singleton.
  // This is that singleton!
  sdk (
    serviceName: string,
    instrumentations: OtlpInstrumentation[],
    traceExporter: OTLPTraceExporter
  ): OtlpSDK {
    return new OtlpSDK({
      resource: new otlpResources.Resource({
        [otlpSemanticConventions.SemanticResourceAttributes.SERVICE_NAME]: serviceName
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
  metadata?: (writeKey: string, dataset: string) => grpc.Metadata
  sampler?: (sampleRate: Number) => otlpAPI.Sampler
  tracerProvider?: (sampler: otlpAPI.Sampler) => NodeTracerProvider
  traceExporter?: (url: string, metadata: grpc.Metadata) => OTLPTraceExporter
  spanProcessor?: (traceExporter: OTLPTraceExporter) => otlpTraceBase.SpanProcessor
  instrumentations?: () => OtlpInstrumentation[];
  sdk?: (
    serviceName: string,
    instrumentations: OtlpInstrumentation[],
    traceExporter: OTLPTraceExporter
  ) => OtlpSDK;
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
    let otlp: boolean = false
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
      otlp = /^grpc:\/\//.test(apiHost)
    }

    return {
      serviceName,
      disable,
      otlp,
      writeKey,
      dataset,
      apiHost,
      sampleRate
    }
  }

  private getWriteKey (): string {
    if (this.features.honeycomb && this.options.writeKey) {
      return this.options.writeKey
    }
    throw new HoneycombError('HONEYCOMB_WRITEKEY is undefined!')
  }

  private getDataset () {
    if (this.features.honeycomb && this.options.dataset) {
      return this.options.dataset
    }
    throw new HoneycombError('HONEYCOMB_DATASET is undefined!')
  }

  private getApiHost () {
    if (this.features.honeycomb && this.options.apiHost) {
      return this.options.apiHost
    }
    throw new HoneycombError('HONEYCOMB_API_HOST is undefined!')
  }

  public options: HoneycombOptions
  public features: HoneycombFeatures
  public factories: OTLPFactories

  public initialized: boolean
  public started: boolean
  public sdk: OtlpSDK | null
  public tracer: otlpAPI.Tracer

  constructor(
    options: HoneycombOptions,
    overrides: OTLPFactoryOverrides = {}
  ) {
    this.options = options
    this.features = {
      honeycomb: !options.disable,
      beeline: !options.disable && !options.otlp,
      otlp: options.otlp || false
    }
    this.initialized = false
    this.started = false
    this.sdk = null
    this.tracer = otlpAPI.trace.getTracer('boltzmann', '1.0.0')
    this.factories = {
      ...defaultOtlpFactories,
      ...(overrides || {})
    }
  }

  public static log(message: any): void {
    // There's a good likelihood that bole hasn't been configured yet,
    // so we use console here. We also want honeycomb to fail gracefully
    // as nothing is more embarrassing than your service getting taken
    // down by instrumentation, so we only log in live dev and in debug.
    void `{% if not selftest %}`
    if (process.env.DEBUG || isDev()) {
      console.warn(message);
    }
    void `{% endif %}`
  }

  // Some non-standard OpenTelemetry attributes we add in
  // the middlewares...

  public static OTEL_REQ_QUERY = 'boltzmann.query'

  public static paramAttribute(param: string): string {
    return `boltzmann.request.param.${param}`
  }

  // Initialize Honeycomb! Stands up the otlp node SDK if enabled,
  // otherwise sets up the beeline library.
  // This needs to occur before any imports you want instrumentation
  // to be aware of.
  public init(): void {
    try {
      const writeKey = this.getWriteKey();
      const dataset = this.getDataset();
      const sampleRate = this.options.sampleRate || 1;
      const serviceName = this.options.serviceName;

      if (!this.features.honeycomb) {
        console.log("calling the beeline function")
        beeline({ writeKey, dataset, sampleRate, serviceName })
        return
      }

      const f = this.factories
      const apiHost: string = this.getApiHost()

      const metadata: grpc.Metadata = f.metadata(writeKey, dataset)

      const sampler: otlpAPI.Sampler = f.sampler(sampleRate)
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
    } catch (err) {
      if (err instanceof HoneycombError) {
        // Honeycomb.log(err);
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

    async function die(err: Error) {
      Honeycomb.log(err);
      exitCode = 1
      await shutdown()
    }

    async function shutdown() {
      if (sdk) {
        try {
          await sdk.shutdown()
        } catch (err) {
          Honeycomb.log(err)
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
      Honeycomb.log('trace headerSources are a beeline-only feature')
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
          [otlpSemanticConventions.SemanticAttributes.HTTP_HOST]: context.host,
          [otlpSemanticConventions.SemanticAttributes.HTTP_URL]: context.url.href,
          [otlpSemanticConventions.SemanticAttributes.NET_PEER_IP]: context.remote,
          [otlpSemanticConventions.SemanticAttributes.HTTP_METHOD]: context.method,
          [otlpSemanticConventions.SemanticAttributes.HTTP_SCHEME]: context.url.protocol,
          [otlpSemanticConventions.SemanticAttributes.HTTP_ROUTE]: context.url.pathname,
          // TODO: Honeycomb.Attributes obvs
          [Honeycomb.OTEL_REQ_QUERY]: context.url.search
        }
      }
    )

    // this propagator takes care of extracting trace parent
    // and state from request headers (and so on)
    const propagator = new otlpCore.W3CTraceContextPropagator()

    propagator.inject(
      otlpAPI.trace.setSpanContext(
        otlpAPI.ROOT_CONTEXT,
        parentSpan.spanContext()
      ),
      carrier,
      otlpAPI.defaultTextMapSetter
    )

    /* TODO: Do I need to create and set a context? No, right?

    // create a parent active context
    const parentContext = propagator.extract(
      otlpAPI.ROOT_CONTEXT,
      carrier,
      otlpAPI.defaultTextMapGetter
    )

    // set the active context
    await traceContext.with(parentContext, async () => {

    */

    const rv = await runInContext()

    const handler: Handler = <Handler>context.handler

    parentSpan.setAttribute(
      otlpSemanticConventions.SemanticAttributes.HTTP_STATUS_CODE,
      String(context._response.statusCode)
    )
    parentSpan.setAttribute(
      otlpSemanticConventions.SemanticAttributes.HTTP_ROUTE,
      <string>handler.route
    )
    parentSpan.setAttribute(
      otlpSemanticConventions.SemanticAttributes.HTTP_METHOD,
      <string>handler.method
    )
    parentSpan.setAttribute(
      otlpSemanticConventions.SemanticResourceAttributes.SERVICE_VERSION,
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
    const _headerSources = headerSources || this.defaultHeaderSources
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
    if (!this.features.otlp) {
      // Call legacy beelines implementation
      return this.withBeelineSpan(name, runInContext)
    }

    const span = this.tracer.startSpan(name)
    otlpAPI.trace.setSpan(otlpAPI.context.active(), span)

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
  grpc,
  otlpAPI,
  otlpCore,
  OTLPTraceExporter,
  otlpResources,
  OtlpSDK,
  otlpTraceBase,
  NodeTracerProvider,
  otlpSemanticConventions,
  OtlpInstrumentation,
  OtlpDnsInstrumentation,
  OtlpHttpInstrumentation,
  // {% if redis %}
  OtlpRedisInstrumentation,
  // {% endif %}
  // {% if postgres %}
  OtlpPgInstrumentation
  // {% endif %}
}

export {
  defaultOtlpFactories,
  Honeycomb,
  HoneycombError,
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

    t.test('options.otlp', async (assert: Test) => {
      assert.equal(
        Honeycomb.parseEnv('boltzmann', {}).otlp,
        false,
        'should not use otlp when no env vars'
      )
      assert.equal(
        Honeycomb.parseEnv('boltzmann', {HONEYCOMB_WRITEKEY: ''}).otlp,
        false,
        'should not use otlp when env vars are blank'
      )
      assert.equal(
        Honeycomb.parseEnv('boltzmann', {HONEYCOMB_WRITEKEY: 'some write key'}).otlp,
        false,
        'should not use otlp when only write key is defined'
      )
      assert.equal(
        Honeycomb.parseEnv(
          'boltzmann', 
          {
            HONEYCOMB_WRITEKEY: 'some write key',
            HONEYCOMB_API_HOST: 'https://refinery.website'
          }
        ).otlp,
        false,
        'should not use otlp when API host is not grpc://'
      )
      assert.equal(
        Honeycomb.parseEnv(
          'boltzmann',
          {
            HONEYCOMB_WRITEKEY: 'some write key',
            HONEYCOMB_API_HOST: 'grpc://otlp.website'
          }
        ).otlp,
        true,
        '*should* use otlp when API host is grpc://'
      )
      assert.equal(
        Honeycomb.parseEnv(
          'boltzmann',
          {
            HONEYCOMB_WRITEKEY: '',
            HONEYCOMB_API_HOST: 'grpc://otlp.website'
          }
        ).otlp,
        false,
        'should not use otlp when write key is empty, even if API host is grpc://'
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
      otlp: true,
      writeKey: 'some write key',
      dataset: 'some dataset',
      apiHost: 'grpc://example.com',
      sampleRate: 1,
    }

    t.test('metadata', async (assert: Test) => {
      const metadata = defaultOtlpFactories.metadata(
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
        defaultOtlpFactories.sampler(1) instanceof otlpCore.ParentBasedSampler,
        'sampler(1) should be a otlpCore.ParentBasedSampler'
      )
      assert.ok(
        defaultOtlpFactories.sampler(0) instanceof otlpCore.ParentBasedSampler,
        'sampler(0) should be a otlpCore.ParentBasedSampler'
      )
      assert.ok(
        defaultOtlpFactories.sampler(0.5) instanceof otlpCore.ParentBasedSampler,
        'sampler(0.5) should be a otlpCore.ParentBasedSampler'
      )
    })

    test('tracerProvider', async (assert: Test) => {
      const sampler = defaultOtlpFactories.sampler(1)
      assert.doesNotThrow(
        () => defaultOtlpFactories.tracerProvider(sampler),
        'should create a tracer provider'
      )
    })

    test('traceExporter', async (assert: Test) => {
      assert.doesNotThrow(() => {
        const url = 'grpc://example.com'
        const metadata = defaultOtlpFactories.metadata(
          'some write key',
          'some dataset'
        )

        defaultOtlpFactories.traceExporter(url, metadata)
      }, 'should create a trace exporter')
    })

    test('spanProcessor', async (assert: Test) => {
      assert.doesNotThrow(() => {
        const exporter = defaultOtlpFactories.traceExporter(
          'grpc://example.com',
          defaultOtlpFactories.metadata(
            'some write key',
            'some dataset'
          )
        )

        defaultOtlpFactories.spanProcessor(exporter)
      }, 'should create a span processor')
    })

    test('instrumentations', async (assert: Test) => {
      // expected instrumentations: dns, node core, postgres, redis
      assert.equal(
        defaultOtlpFactories.instrumentations().length,
        4,
        'should create 4 instrumentations (dns, http, postgres, redis)'
      )
    })

    test('sdk', async (assert: Test) => {
      // run the init function
      assert.doesNotThrow(() => {
        const exporter = defaultOtlpFactories.traceExporter(
          'grpc://example.com',
          defaultOtlpFactories.metadata(
            'some write key',
            'some dataset'
          )
        )
        const instrumentations = defaultOtlpFactories.instrumentations()
        defaultOtlpFactories.sdk('boltzmann', instrumentations, exporter)
      }, 'should create an sdk')
    })
  })
}

void `{% endif %}`
