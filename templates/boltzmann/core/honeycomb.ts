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

import beeline from 'honeycomb-beeline'

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

  // The Honeycomb write key and dataset
  writeKey?: string | null
  dataset?: string | null

  apiHost?: string | null

  // Tunables, etc.
  sampleRate?: number
}

// Whether or not honeycomb is enabled
interface HoneycombFeatures {
  honeycomb: boolean
  beeline: boolean
}

// An interface for the return value of Honeycomb#startSpan
// and/or Honeycomb#startTrace.
interface Span {
  end(): Promise<void>
}

// Let's GOOOOOOO
class Honeycomb {
  // We load options from the environment. Unlike with Options,
  // we do a lot of feature detection here.
  public static fromEnv(
    serviceName: string,
    env: typeof process.env = process.env
  ): Honeycomb {
    return new Honeycomb(
      Honeycomb.parseEnv(serviceName, env)
    )
  }

  public static parseEnv(serviceName: string, env: typeof process.env = process.env): HoneycombOptions {
    // If there's no write key we won't get very far anyway
    const disable = !env.HONEYCOMB_WRITEKEY
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

    return {
      serviceName,
      disable,
      writeKey,
      dataset,
      apiHost,
      sampleRate
    }
  }

  public static _traceSpanName(method: string, pathname: string) {
    return `${method} ${pathname}`
  }

  // These accessors are type guards that ensure you're working
  // with a defined/non-null property. It's a bit of 6-to-1 and
  // half a dozen on the other, because you trade ifs for
  // try/catches and honeycomb can basically never throw. Even
  // so, it saves a little bit of boilerplate.
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

  public initialized: boolean
  public started: boolean

  constructor(
    options: HoneycombOptions
  ) {
    this.options = options
    this.features = {
      honeycomb: !options.disable,
      beeline: !options.disable,
    }
    this.initialized = false
    this.started = false
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

  // Initialize Honeycomb! Sets up the beeline library.
  // This needs to occur before any imports you want instrumentation
  // to be aware of.
  public init(): void {
    try {
      const writeKey = this.getWriteKey();
      const dataset = this.getDataset();
      const sampleRate = this.options.sampleRate || 1;
      const serviceName = this.options.serviceName;

      if (this.features.honeycomb) {
        beeline({ writeKey, dataset, sampleRate, serviceName })
        this.initialized = true
        return
      }
    } catch (err) {
      if (err instanceof HoneycombError) {
        // Honeycomb.log(err);
        return;
      }
      throw err;
    }
  }

  // When implemented, this will start the OpenTelemetry SDK. In the
  // case of beelines, it's a no-op. In the otel case, this will need
  // to happen before anything happens in the entrypoint and is an
  // async operation.
  public async start(): Promise<void> {
    this.started = true
  }

  // Start a trace. Returns a Trace, which may be closed by calling
  // `trace.end()`.
  public async startTrace(context: Context, headerSources?: string[]): Promise<Span> {
    if (!this.features.honeycomb || !this.initialized) {
      return {
        async end() {}
      }
    }

    // The core of this method is hidden away in preparation for the
    // bulk of this method being OTLP focused later.
    return this._startBeelineTrace(context, headerSources)
  }

  // Beelines implementation for starting/ending a trace
  private defaultHeaderSources: string[] = [ 'x-honeycomb-trace', 'x-request-id' ]

  private async _startBeelineTrace(
    context: Context,
    headerSources?: string[]
  ): Promise<Span> {
    if (!this.features.honeycomb || !this.initialized) {
      return {
        async end() {}
      }
    }

    const schema = require('honeycomb-beeline/lib/schema')
    const tracker = require('honeycomb-beeline/lib/async_tracker')
    const _headerSources = headerSources || this.defaultHeaderSources
    const traceContext = _getBeelineTraceContext(context)
    const trace = beeline.startTrace({
      [schema.EVENT_TYPE]: 'boltzmann',
      [schema.PACKAGE_VERSION]: '1.0.0',
      [schema.TRACE_SPAN_NAME]: Honeycomb._traceSpanName(context.method, context.url.pathname),
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

    return {
      end: async () => {
        boundFinisher(this, tracker.getTracked())
      }
    }

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

  // Starting a span. For OpenTelemetry this is a "child" span
  // (OTLP doesn't have the same trace concept as beelines. Returns
  // a Span object.
  public async startSpan(name: string, attributes?: { [a: string]: string | undefined }): Promise<Span> {

    if (!this.features.honeycomb || !this.initialized) {
      return {
        async end() {}
      }
    }

    // This method is also intended to focus on OTLP in the future...
    return this._startBeelineSpan(name, attributes || {})
  }

  private async _startBeelineSpan(name: string, attributes: { [a: string]: string | undefined}): Promise<Span> {
    if (!this.features.honeycomb || !this.initialized) {
      return {
        async end() {}
      }
    }

    const span = beeline.startSpan({ name, ...attributes })

    return {
      async end() {
        beeline.finishSpan(span)
      }
    }
  }
}

export {
  beeline,
}

export {
  Honeycomb,
  HoneycombError,
  HoneycombOptions,
  HoneycombFeatures,
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

    t.test('Honeycomb._traceSpanName', async (assert: Test) => {
      assert.same(
        Honeycomb._traceSpanName('GET', '/echo'),
        'GET /echo'
      )
    });
  })
}

void `{% endif %}`
