#!/usr/bin/env node
/* eslint-disable */
/* c8 ignore file */
'use strict';
/**/
// Dependencies used outside of honeycomb
const bole = require("@entropic/bole");
const isDev = require("are-we-dev");
module.exports = {...module.exports,  bole, isDev };
void ``;
// We continue to support beelines...
const beeline = require("honeycomb-beeline");
// ...but are migrating to OpenTelemetry:
const grpc = require("@grpc/grpc-js");
const otel = require("@opentelemetry/api");
const otelCore = require("@opentelemetry/core");
const otlpHttp = require("@opentelemetry/exporter-trace-otlp-http");
const otlpProto = require("@opentelemetry/exporter-trace-otlp-proto");
const otlpGrpc = require("@opentelemetry/exporter-trace-otlp-grpc");
const otelResources = require("@opentelemetry/resources");
const { NodeSDK: OtelSDK } = require("@opentelemetry/sdk-node");
const otelTraceBase = require("@opentelemetry/sdk-trace-base");
const { NodeTracerProvider } = require("@opentelemetry/sdk-trace-node");
const otelSemanticConventions = require("@opentelemetry/semantic-conventions");
const { DnsInstrumentation: OtelDnsInstrumentation } = require("@opentelemetry/instrumentation-dns");
const { HttpInstrumentation: OtelHttpInstrumentation } = require("@opentelemetry/instrumentation-http");
void ``;
const { RedisInstrumentation: OtelRedisInstrumentation } = require("@opentelemetry/instrumentation-redis");
void ``;
void ``;
class HoneycombError extends Error {
}
// A diagnostic logger for OpenTelemetry. To log at a sensible level,
// call otel.diag.verbose.
class HoneycombDiagLogger {
    // Ideally we would log to a bole logger. However, logger setup happens
    // relatively late - in the log middleware - and it's very likely that such
    // a log won't be in-place when we stand up the middleware stack! Therefore,
    // we do log to bole if it's set in the middleware but will fall back to
    // good ol' fashioned JSON.stringify if need be.
    constructor() {
        this._stream = process.stdout;
        // So log messages roughly match what's output by the bole in dev mode :^)
        if (isDev()) {
            const pretty = require('bistre')({ time: true });
            this._stream = pretty.pipe(this._stream);
        }
    }
    // OpenTelemetry's diagnostic logger has one more log level than bole - ie,
    // verbose.
    //
    // For more details on how to treat each log level, see:
    // https://github.com/open-telemetry/opentelemetry-js-api/blob/main/src/diag/consoleLogger.ts#L60
    // Log errors that caused an unexpected failure
    error(message, ...args) {
        this._log('error', message, args);
    }
    // Log warnings that aren't show-stopping but should REALLY be looked at
    warn(message, ...args) {
        this._log('warn', message, args);
    }
    // Log info if you want to be REALLY LOUD for some reason - you probably
    // don't want to use this!
    info(message, ...args) {
        this._log('info', message, args);
    }
    // Log details that could be useful for identifying what went wrong, but
    // aren't the thing that went wrong itself - treat this as you would info
    // logging normally
    debug(message, ...args) {
        this._log('debug', message, args);
    }
    // Log fine-grained details that are mostly going to be useful to those
    // adding new OpenTelemetry related features to boltzmann - treat this like
    // you would debug level logging normally
    verbose(message, ...args) {
        this._log('debug', `VERBOSE: ${message}`, args);
    }
    _log(level, message, args) {
        let isSelfTest = false;
        void ``;
        if (isSelfTest) {
            return;
        }
        // Log to bole if we have it
        if (this.logger) {
            this.logger[level](message, ...args);
            return;
        }
        const line = {
            time: (new Date()).toISOString(),
            level,
            name: 'boltzmann:honeycomb',
            message,
            args
        };
        try {
            // are the args JSON-serializable?
            this._writeLine(JSON.stringify(line));
            // SURVEY SAYS...
        }
        catch (_) {
            // ...ok, make it a string as a fallback
            line.args = require('util').format('%o', line.args);
            this._writeLine(JSON.stringify(line));
        }
    }
    _writeLine(line) {
        this._stream.write(Buffer.from(line + '\n'));
    }
}
// We only do OpenTelemetry logging if boltzmann's main log level is debug
const _diagLogger = new HoneycombDiagLogger();
if (!process.env.LOG_LEVEL || process.env.LOG_LEVEL === 'debug') {
    otel.diag.setLogger(_diagLogger, otelCore.getEnv().OTEL_LOG_LEVEL);
}
const _OtelSpanProcessor = otelTraceBase.SimpleSpanProcessor;
class HoneycombSpanProcessor extends _OtelSpanProcessor {
    constructor(_exporter) {
        super(_exporter);
    }
    // We want every span in the process to contain a couple of extra attributes.
    // Right now that's just service_name (for backwards compatibility with
    // beeline) and a trace type (so we can detect whether a service is using
    // beeline or otel). This could theoretically be extended to allow
    // customization a la beeline.addTraceContext, but that problem is really
    // hairy and there are a lot of good reasons to add most attributes to
    // just the active span.
    onStart(span, _) {
        span.setAttribute('service_name', span.resource.attributes['service.name']);
        span.setAttribute('honeycomb.trace_type', 'otel');
        otelTraceBase.SimpleSpanProcessor.prototype.onStart.call(this, span);
    }
    onEnd(span) {
        otelTraceBase.SimpleSpanProcessor.prototype.onEnd.call(this, span);
    }
}
const defaultOtelFactories = {
    headers(writeKey, dataset) {
        let headers = {};
        if (writeKey) {
            headers['x-honeycomb-team'] = writeKey;
        }
        if (dataset) {
            headers['x-honeycomb-dataset'] = dataset;
        }
        return headers;
    },
    resource(serviceName) {
        return new otelResources.Resource({
            [otelSemanticConventions.SemanticResourceAttributes.SERVICE_NAME]: serviceName
        });
    },
    // A tracer provider is effectively a Tracer factory and is used to power
    // the otel.getTrace API
    tracerProvider(resource) {
        return new NodeTracerProvider({ resource });
    },
    // There are three different OTLP span exporter classes - one for grpc, one
    // for http/protobuf and one for http/json - this will return the appropriate
    // one for the configured protocol.
    spanExporter(protocol, headers) {
        // Instead of subclassing each implementation, monkey patch the send
        // method on whichever instance we create
        function patchSend(exporter) {
            const send = exporter.send;
            exporter.send = function (objects, onSuccess, 
            // This error is actually an Error subtype which corresponds 1:1 with
            // the OTLPTraceExporter class being instrumented, but making this a
            // proper generic type is hard - it's fine!
            onError) {
                otel.diag.debug(`sending ${objects.length} spans to ${this.url}`);
                send.call(this, objects, () => {
                    otel.diag.debug(`successfully send ${objects.length} spans to ${this.url}`);
                    return onSuccess();
                }, (error) => {
                    otel.diag.debug(`error while sending ${objects.length} spans: ${error}`);
                    return onError(error);
                });
            };
        }
        if (protocol === 'grpc') {
            const metadata = new grpc.Metadata();
            for (let [key, value] of Object.entries(headers)) {
                metadata.set(key, value);
            }
            const credentials = grpc.credentials.createSsl();
            const exporter = new otlpGrpc.OTLPTraceExporter({
                credentials,
                metadata
            });
            patchSend(exporter);
            return exporter;
        }
        if (protocol === 'http/json') {
            otel.diag.warn("Honeycomb doesn't support the http/json OTLP protocol - but if you say so");
            const exporter = new otlpHttp.OTLPTraceExporter({
                headers
            });
            patchSend(exporter);
            return exporter;
        }
        if (protocol !== 'http/protobuf') {
            otel.diag.warn(`Unknown OTLP protocol ${protocol} - using http/protobuf instead`);
        }
        const exporter = new otlpProto.OTLPTraceExporter({
            headers
        });
        patchSend(exporter);
        return exporter;
    },
    // Process spans, using the supplied trace exporter to
    // do the actual exporting.
    spanProcessor(spanExporter) {
        return new HoneycombSpanProcessor(spanExporter);
    },
    instrumentations() {
        // Any paths we add here will get no traces whatsoever. This is
        // appropriate for the ping route, which should never trace.
        const ignoreIncomingPaths = [
            '/monitor/ping'
        ];
        // OpenTelemetry attempts to auto-collect GCE metadata, causing traces
        // we don't care about. We do our best to ignore them by independently
        // calculating which endpoints it's going to try to call.
        //
        // See: https://github.com/googleapis/gcp-metadata/blob/main/src/index.ts#L26-L44
        const ignoreOutgoingUrls = [
            /^https?:\/\/169\.254\.169\.254/,
            /^https?:\/\/metadata\.google\.internal/,
        ];
        let gceBase = process.env.GCE_METADATA_IP || process.env.GCE_METADATA_HOST || null;
        if (gceBase) {
            if (!/^https?:\/\//.test(gceBase)) {
                gceBase = `http://${gceBase}`;
            }
            ignoreOutgoingUrls.push(new RegExp(`^${gceBase}`));
        }
        let is = [
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
        ];
        void ``;
        is.push(new OtelRedisInstrumentation({}));
        void ``;
        void ``;
        return is;
    },
    // The SDK will take a service name, instrumentations
    // and a trace exporter and give us a stateful singleton.
    // This is that singleton!
    sdk(resource, instrumentations) {
        return new OtelSDK({
            resource,
            instrumentations
        });
    }
};
// Let's GOOOOOOO
class Honeycomb {
    constructor(options, overrides = {}) {
        this.options = options;
        this.features = {
            honeycomb: !options.disable,
            beeline: !options.disable && !options.otel,
            otel: options.otel || false
        };
        this.initialized = false;
        this.started = false;
        this.tracerProvider = null;
        this.spanExporter = null;
        this.spanProcessor = null;
        this.instrumentations = null;
        this.sdk = null;
        this.factories = {
            ...defaultOtelFactories,
            ...(overrides || {})
        };
        this._logger = null;
    }
    get tracer() {
        return otel.trace.getTracer('boltzmann', '0.6.0');
    }
    // We (usually) load options from the environment. Unlike with Options,
    // we do a lot of feature detection here.
    static fromEnv(env = process.env, overrides = {}) {
        return new Honeycomb(Honeycomb.parseEnv(env), overrides);
    }
    // serviceName is defined in the prelude, so rather than doing the same
    // logic twice we let the prelude inject it when creating the honeycomb
    // object.
    static parseEnv(env = process.env) {
        // For beelines, if we don't have HONEYCOMB_WRITEKEY there isn't much we
        // can do...
        let disable = !env.HONEYCOMB_WRITEKEY;
        // Beelines should pick these up automatically, but we'll need them to
        // configure default OTLP headers
        const writeKey = env.HONEYCOMB_WRITEKEY || null;
        const dataset = env.HONEYCOMB_DATASET || null;
        // OpenTelemetry is configured with a huge pile of `OTEL_*` environment
        // variables. If any of them are defined, we'll use OpenTelemetry instead
        // of beelines. Typically one would configure OTEL_EXPORTER_OTLP_ENDPOINT
        // to point to either api.honeycomb.io or your local refinery, but this
        // will flag on OTEL_ENABLED=1 as well if you want to use all the
        // defaults.
        //
        // For a broad overview of common variables, see:
        // https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/sdk-environment-variables.md
        //
        // For a list of variables the OTLP exporter respects, see:
        // https://opentelemetry.io/docs/reference/specification/protocol/exporter/
        const isOtel = Object.entries(env).some(([name, value]) => {
            return name.startsWith('OTEL_') && value && value.length;
        });
        // OpenTelemetry can optionally load the honeycomb headers from the
        // OTEL_EXPORTER_OTLP_HEADERS and/or OTEL_EXPORTER_OTLP_TRACE_HEADERS
        // environment variables, so having HONEYCOMB_WRITEKEY be falsey is
        // potentially OK. This strategy also allows people to use the
        // honeycomb tracing for non-honeycomb use cases.
        if (isOtel) {
            disable = false;
        }
        // This sample rate is for beeline only - to set the OpenTelemetry sample
        // rate, set OTEL_TRACES_SAMPLER=parentbased_traceidratio and
        // OTEL_TRACES_SAMPLER_ARG=${SOME_NUMBER}. Note that beeline defines
        // sample rate as total/sampled, but OpenTelemetry defines it as
        // sampled/total!
        let sampleRate = Number(env.HONEYCOMB_SAMPLE_RATE || 1);
        if (isNaN(sampleRate)) {
            sampleRate = 1;
        }
        // OTLP is supposed to be configured with this environment variable, but
        // the OpenTelemetry SDKs leave this as a some-assembly-required job.
        // We default to 'http/protobuf' because it's well-supported by both
        // Honeycomb and AWS load balancers and because it's relatively snappy.
        //
        // For more information on how this is configured, see:
        // https://opentelemetry.io/docs/reference/specification/protocol/exporter/#specify-protocol
        const otlpProtocol = env.OTEL_EXPORTER_OTLP_PROTOCOL || env.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL || 'http/protobuf';
        // The service name logic is VERY similar to what's in prelude.ts,
        // except that OTEL_SERVICE_NAME takes precedence if defined
        const serviceName = (() => {
            try {
                return env.OTEL_SERVICE_NAME || env.SERVICE_NAME || require('./package.json').name.split('/').pop();
            }
            catch (err) {
                return 'boltzmann';
            }
        })();
        return {
            serviceName,
            disable,
            otel: isOtel,
            writeKey,
            dataset,
            sampleRate,
            otlpProtocol
        };
    }
    // Initialize Honeycomb! Stands up the otel node SDK if enabled,
    // otherwise sets up the beeline library.
    // This needs to occur before any imports you want instrumentation
    // to be aware of. This step is separated from the constructor if only because
    // there are irreversible side effects galore.
    init() {
        if (!this.features.honeycomb) {
            this.initialized = true;
            return;
        }
        try {
            const writeKey = this.writeKey;
            const dataset = this.dataset;
            const sampleRate = this.sampleRate;
            const serviceName = this.serviceName;
            if (this.features.beeline && writeKey) {
                beeline({ writeKey, dataset, sampleRate, serviceName });
                this.initialized = true;
                return;
            }
            const f = this.factories;
            const headers = f.headers(writeKey, dataset);
            const resource = f.resource(serviceName);
            const exporter = f.spanExporter(this.options.otlpProtocol || 'http/protobuf', headers);
            const processor = f.spanProcessor(exporter);
            const instrumentations = f.instrumentations();
            const provider = f.tracerProvider(resource);
            provider.addSpanProcessor(processor);
            provider.register();
            const sdk = f.sdk(resource, instrumentations);
            this.spanExporter = exporter;
            this.spanProcessor = processor;
            this.instrumentations = instrumentations;
            this.tracerProvider = provider;
            this.sdk = sdk;
            this.initialized = true;
        }
        catch (err) {
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
    async start() {
        let exitCode = 0;
        const sdk = this.sdk;
        const die = async (err) => {
            otel.diag.error(err.stack || String(err));
            exitCode = 1;
            await shutdown();
        };
        const shutdown = async () => {
            await this.stop();
            process.exit(exitCode);
        };
        if (sdk) {
            process.once('SIGTERM', shutdown);
            process.once('beforeExit', shutdown);
            process.once('uncaughtException', die);
            process.once('unhandledRejection', async (reason, _) => {
                await die(reason);
            });
            await sdk.start();
        }
        this.started = true;
    }
    async stop() {
        const sdk = this.sdk;
        if (!sdk)
            return;
        try {
            await sdk.shutdown();
        }
        catch (err) {
            otel.diag.error(err.stack || String(err));
        }
    }
    get writeKey() {
        return this.options.writeKey || null;
    }
    get dataset() {
        return this.options.dataset || null;
    }
    get sampleRate() {
        return this.options.sampleRate || 1;
    }
    get serviceName() {
        return this.options.serviceName || 'boltzmann';
    }
    get logger() {
        return this._logger;
    }
    set logger(logger) {
        this._logger = logger;
        _diagLogger.logger = logger ? logger : undefined;
    }
}
module.exports = {...module.exports,  beeline, otel, otelCore, otelResources, OtelSDK, otelTraceBase, NodeTracerProvider, otelSemanticConventions, OtelDnsInstrumentation, OtelHttpInstrumentation, 
// 
OtelRedisInstrumentation, 
// 
// 
 };
module.exports = {...module.exports,  defaultOtelFactories, Honeycomb, HoneycombError, HoneycombSpanProcessor, };
void ``;
if (!process.env.HONEYCOMB_DATASET && process.env.HONEYCOMBIO_DATASET) {
    process.env.HONEYCOMB_DATASET = process.env.HONEYCOMBIO_DATASET;
}
if (!process.env.HONEYCOMB_WRITEKEY && process.env.HONEYCOMBIO_WRITEKEY) {
    process.env.HONEYCOMB_WRITEKEY = process.env.HONEYCOMBIO_WRITEKEY;
}
if (!process.env.HONEYCOMB_SAMPLE_RATE && process.env.HONEYCOMBIO_SAMPLE_RATE) {
    process.env.HONEYCOMB_SAMPLE_RATE = process.env.HONEYCOMBIO_SAMPLE_RATE;
}
if (!process.env.HONEYCOMB_TEAM && process.env.HONEYCOMBIO_TEAM) {
    process.env.HONEYCOMB_TEAM = process.env.HONEYCOMBIO_TEAM;
}
let honeycomb = Honeycomb.fromEnv(process.env);
void ``;
honeycomb.init();
module.exports = {...module.exports,  honeycomb };
void ``;
void ``;

'use strict';
// Boltzmann v0.6.0
/**/
const serviceName = _getServiceName();
function _getServiceName() {
    try {
        return process.env.SERVICE_NAME || require('./package.json').name.split('/').pop();
    }
    catch {
        return 'boltzmann';
    }
}
/**/
void ``;
const onHeaders = require("on-headers");
void ``;
const ships = require("culture-ships");
void ``;
const ship = ships.random();
void ``;
const { IncomingMessage, ServerResponse } = require("http");
const { URL } = require("url");
const uuid = require("uuid");
const { seal, unseal, defaults: ironDefaults } = require("@hapi/iron");
const { HTTPVersion } = require("find-my-way");
const Ajv = require("ajv");
const assert = require("assert");
const cookie = require("cookie");
void ``;
void ``;
void ``;
void ``;
void ``;
void ``;
void ``;
const CsrfTokens = require("csrf");
void ``;
void ``;
void ``;
void ``;
const { Readable } = require("stream");
const querystring = require("querystring");
const { promisify } = require("util");
const fmw = require("find-my-way");
const accepts = require("accepts");
const { promises: fs } = require("fs");
const crypto = require("crypto");
const http = require("http");
const path = require("path");
const os = require("os");
void ``;
const redis = require("handy-redis");
void ``;
void ``;
const THREW = Symbol.for('threw');
const STATUS = Symbol.for('status');
const REISSUE = Symbol.for('reissue');
const HEADERS = Symbol.for('headers');
const TEMPLATE = Symbol.for('template');
void ``;




void ``;
function buildBodyParser(bodyParsers) {
    const parserDefs = [_attachContentType, ...bodyParsers];
    return parserDefs.reduceRight((lhs, rhs) => rhs(lhs), (_) => {
        throw Object.assign(new Error('Cannot parse request body'), {
            [Symbol.for('status')]: 415
        });
    });
}
function _attachContentType(next) {
    return (request) => {
        const [contentType, ...attrs] = (request.headers['content-type'] ||
            'application/octet-stream').split(';').map(xs => xs.trim());
        const attrsTuples = attrs.map(xs => xs.split('=').map(ys => ys.trim()).slice(0, 2));
        const params = new Map(attrsTuples);
        const charset = (params.get('charset') || 'utf-8').replace(/^("(.*)")|('(.*)')$/, '$2$4').toLowerCase();
        const [type, vndsubtype = ''] = contentType.split('/');
        const subtypeParts = vndsubtype.split('+');
        const subtype = subtypeParts.pop() || '';
        const augmentedRequest = Object.assign(request, {
            contentType: {
                vnd: subtypeParts.join('+'),
                type,
                subtype,
                charset,
                params
            }
        });
        return next(augmentedRequest);
    };
}

void ``;
async function buildMiddleware(middleware, router) {
    const middlewareToSplice = (isDev()
        ? (mw) => [
            // 
            honeycombMiddlewareSpans(mw),
            // 
            dev(mw.name),
            enforceInvariants()
        ]
        : (mw) => [
            // 
            honeycombMiddlewareSpans(mw),
            // 
            enforceInvariants()
        ]);
    const result = middleware.reduce((lhs, rhs) => {
        const [mw, ...args] = Array.isArray(rhs) ? rhs : [rhs];
        return [...lhs, ...middlewareToSplice(mw), mw(...args)];
    }, []).concat(middlewareToSplice(route));
    // 
    // drop the outermost honeycombMiddlewareSpans mw.
    result.shift();
    // 
    return result.reduceRight(async (lhs, rhs) => {
        return rhs(await lhs);
    }, Promise.resolve(router));
}
function handlerSpanName(handler) {
    return `handler: ${handler.name || '<unknown>'}`;
}
async function handler(context) {
    const handler = context.handler;
    // 
    let beelineSpan = null;
    let otelSpan = null;
    let traceContext = otel.context.active();
    if (honeycomb.features.beeline) {
        beelineSpan = beeline.startSpan({
            name: handlerSpanName(handler),
            'handler.name': handler.name,
            'handler.method': String(handler.method),
            'handler.route': handler.route,
            'handler.version': handler.version || '*',
            'handler.decorators': String(handler.decorators),
            [otelSemanticConventions.SemanticResourceAttributes.SERVICE_NAME]: honeycomb.options.serviceName,
            'honeycomb.trace_type': 'beeline',
        });
    }
    else if (honeycomb.features.otel) {
        otelSpan = honeycomb.tracer.startSpan(handlerSpanName(handler), {
            attributes: {
                'boltzmann.http.handler.name': handler.name || '<anonymous>',
                'boltzmann.handler.method': String(handler.method),
                'boltzmann.handler.route': handler.route,
                'boltzmann.http.handler.version': handler.version || '*',
                'boltzmann.http.handler.decorators': String(handler.decorators)
            },
            kind: otel.SpanKind.SERVER
        }, traceContext);
        traceContext = otel.trace.setSpan(traceContext, otelSpan);
    }
    try {
        return await otel.context.with(traceContext, async () => {
            // 
            return await handler(context);
            // 
        });
    }
    finally {
        if (beelineSpan !== null) {
            beeline.finishSpan(beelineSpan);
        }
        else if (otelSpan !== null) {
            otelSpan.end();
        }
    }
    // 
}
void ``;

void ``;
async function routes(handlers) {
    const routes = [];
    for (let [key, handler] of Object.entries(handlers)) {
        if (typeof handler.route === 'string') {
            const [methodPart, ...routeParts] = handler.route.split(' ');
            const route = routeParts.length === 0 ? methodPart : routeParts.join(' ');
            const method = route.length === 0 ? [].concat(handler.method) || ['GET'] : methodPart;
            const { version, middleware, decorators, ...rest } = handler;
            let location = null;
            let link = null;
            if (isDev() && !process.env.TAP) {
                const getFunctionLocation = require('get-function-location');
                location = await getFunctionLocation(handler);
                link = `${location.source.replace('file://', 'vscode://file')}:${location.line}:${location.column}`;
            }
            routes.push({
                key,
                location,
                link,
                method: [].concat(handler.method || method || 'GET'),
                route,
                version,
                middleware,
                handler,
                props: rest
            });
        }
    }
    return routes;
}


void ``;
class Context {
    constructor(request, _response) {
        this.request = request;
        this._response = _response;
        /**{{ changelog(version = "0.5.0") }}
 * 
 * The handler function to be called once all app-attached middleware has
 * executed. If no route was matched, this property will refer to
 * `Context.prototype.handler`, which returns a `NoMatchError` with a `404 Not Found` status code. Any middleware attached to the handler will be applied
 * to the function & all handler-attached properties will be normalized.
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/02-handlers#handler")*/
        this.handler = Context.baseHandler;
        this.request = request;
        this.start = Date.now();
        this.remote = request.socket
            ? (request.socket.remoteAddress || '').replace('::ffff:', '')
            : '';
        const [host,] = (request.headers['host'] || '').split(':');
        this.host = host;
        this.params = {};
        this.id = String(request.headers['x-honeycomb-trace'] ||
            request.headers['x-request-id'] ||
            request.headers['traceparent'] ||
            uuid.v4());
        this._loadSession = async () => {
            throw new Error('To use context.session, attach session middleware to your app');
        };
    }
    static baseHandler(context) {
        throw new NoMatchError(String(context.request.method), context.url.pathname);
    }
    // 
    get hasCookie() {
        return Boolean(this._cookie);
    }
    /**{{ changelog(version = "0.1.1") }}
 * 
 * A specialized [`Map`]( "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map") instance allowing access to [HTTP Cookie]( "https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies") information.
 * `.cookie` supports `.get`, `.set`, `.delete`, `.has`, and all other `Map`
 * methods.
 * 
 * `.cookie` maps cookie names (as strings) to cookie configurations:
 * 
 * ````js
 * {
 *   httpOnly: Boolean, // defaults to true
 *   expires: Date,
 *   maxAge: Number,
 *   secure: Boolean, // defaults to true in production, false in development mode
 *   sameSite: true,  // defaults to true
 *   value: String
 * }
 * ````
 * 
 * This configuration information is passed to the [`cookie`]( "https://github.com/jshttp/cookie#readme") package in order to
 * create [`Set-Cookie`]( "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie") headers for outgoing responses.
 * 
 * Boltzmann tracks the state of the cookie map; if any values change or are
 * deleted, Boltzmann automatically generates and attaches a `Set-Cookie` header to
 * responses.
 * 
 * Incoming cookies don't contain enough information to recreate fields other than
 * `.value`, so those values are synthesized with defaults.
 * 
 * **Example use:**
 * 
 * ````javascript
 * logout.route = 'POST /foo'
 * async function logout(context) {
 *   const { value } = context.cookie.get('sessionid') || {}
 *   if (value) {
 *     cookie.delete('sessionid')
 *   }
 * }
 * 
 * const uuid = require('uuid')
 * 
 * login.route = 'POST /login'
 * async function login(context) {
 *   const {username} = await context.body
 *   const id = uuid.v4()
 *   context.redisClient.set(id, username)
 * 
 *   context.cookie.set('sessionid', {
 *     value: username,
 *     maxAge: 60 // 1 minute! HOW VERY SECURE
 *   })
 * }
 * ````
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/02-handlers#cookie")*/
    get cookie() {
        this._cookie = this._cookie || Cookie.from(this.headers.cookie || '');
        return this._cookie;
    }
    /**{{ changelog(version = "0.1.4") }}
 * 
 * A [`Promise`]( "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise") for a `Session` object. `Session` objects are subclasses of the built-in
 * [`Map`]( "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map") class. `Session` objects provide all of the built-in `Map` methods, and additionally offers:
 * 
 * * `.reissue()`: For existing sessions, regenerates the session id and issues it to the client. Has no
 *   effect for new sessions (the session id does not exist to be regenerated.) Use this when authentication
 *   levels change for a session: logging a user in or out should reissue the session cookie.
 * 
 * You can store any JavaScript object in session storage. **However,** session storage is serialized as
 * JSON, so rich type information will be lost.
 * 
 * **Example use:**
 * 
 * ````javascript
 * sessions.route = 'GET /'
 * async function sessions(context) {
 *   const session = await context.session
 *   const username = session.get('user')
 * 
 *   return username ? 'wow, you are very logged in' : 'not extremely online'
 * }
 * 
 * logout.route = 'POST /logout'
 * async function logout(context) {
 *   const session = await context.session
 *   session.delete('user')
 *   session.reissue() // The user is no longer authenticated. Switch the session storage to a new ID.
 * 
 *   return Object.assign(Buffer.from([]), {
 *     [Symbol.for('status')]: 301,
 *     [Symbol.for('headers')]: {
 *       'location': '/'
 *     }
 *   })
 * }
 * ````
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/02-handlers#session")*/
    get session() {
        return this._loadSession();
    }
    // 
    /**[Docs]("https://www.boltzmann.dev/en/latest/docs/reference/02-handlers#redisClient")*/
    get redisClient() {
        if (!this._redisClient) {
            throw new Error('No redis client available');
        }
        return this._redisClient;
    }
    // 
    /**{{ changelog(version = "0.0.0") }}
 * 
 * A string or array of strings representing the HTTP verbs that route to this
 * handler. In addition to the well-known HTTP verbs, Boltzmann treats `*` as "any
 * HTTP verb is allowed." Overrides the method from the `.route = 'VERB /route'`
 * shorthand.
 * 
 * **Example use**:
 * 
 * ````js
 * // handlers.js
 * module.exports = { multimethod, any, shorthand }
 * 
 * multimethod.route = '/foo'
 * multimethod.method = ['GET', 'POST']
 * async function multimethod (context) {
 * }
 * 
 * any.route = '/foo'
 * any.method = '*'
 * async function any (context) {
 * }
 * 
 * // shorthand for ".method = 'PATCH', .route = '/foo'"
 * shorthand.route = 'PATCH /foo'
 * async function shorthand (context) {
 * }
 * ````
 * 
 * {{ changelog(version = "0.0.0") }}
 * 
 * The [HTTP verb]( "https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods") associated with the incoming request, forwarded from the underlying
 * [node request]( "https://nodejs.org/api/http.html#http_event_request") object.
 * 
 * **Example use:**
 * 
 * ````javascript
 * const assert = require('assert')
 * 
 * assertion.route = 'GET /'
 * async function assertion(context) {
 *   assert.equal(context.method, 'GET')
 * }
 * ````
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/02-handlers#method")*/
    get method() {
        return this.request.method;
    }
    /**{{ changelog(version = "0.0.0") }}
 * 
 * The HTTP [Request Headers]( "https://developer.mozilla.org/en-US/docs/Glossary/Request_header") as a plain JavaScript object.
 * 
 * This forwards the [Node.JS request headers object]( "https://nodejs.org/api/http.html#http_message_headers"). All headers are lower-cased
 * and follow the concatenation rules for repeated headers listed in the linked document.
 * 
 * **Example use:**
 * 
 * ````javascript
 * logout.route = 'GET /'
 * async function logout(context) {
 *   return context.headers['content-type']
 * }
 * ````
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/02-handlers#headers")*/
    get headers() {
        return this.request.headers;
    }
    // 
    /**[Docs]("https://www.boltzmann.dev/en/latest/docs/reference/02-handlers#traceURL")*/
    get traceURL() {
        const url = new URL(`https://ui.honeycomb.io/${process.env.HONEYCOMB_TEAM}/datasets/${process.env.HONEYCOMB_DATASET}/trace`);
        if (honeycomb.features.beeline) {
            url.searchParams.set('trace_id', this._honeycombTrace.payload['trace.trace_id']);
            url.searchParams.set('trace_start_ts', String(Math.floor(this._honeycombTrace.startTime / 1000 - 1)));
        }
        else if (honeycomb.features.otel) {
            const spanCtx = this._honeycombTrace.spanContext();
            let startTime = Date.now() - 60000;
            if (this._honeycombTrace.startTime) {
                const [startSeconds, startNanos] = this._honeycombTrace.startTime;
                startTime = startSeconds * 1000 + startNanos / 1000;
            }
            url.searchParams.set('trace_id', spanCtx.traceId);
            url.searchParams.set('trace_start_ts', String(startTime));
        }
        return String(url);
    }
    // 
    /**{{ changelog(version = "0.0.0") }}
 * 
 * A [`URL`]( "https://developer.mozilla.org/en-US/docs/Web/API/URL_API") instance populated with the `host` header & incoming request path information.
 * This attribute may be set to a `String` in order to recalculate the `url` and `query`
 * properties.
 * 
 * **Example use:**
 * 
 * ````javascript
 * uniformResourceLocation.route = 'GET /'
 * async function uniformResourceLocation(context) {
 *   console.log(context.url.pathname) // "/"
 * 
 *   context.url = '/foo/bar?baz=blorp'
 *   console.log(context.url.pathname) // "/foo/bar"
 *   console.log(context.query.baz) // "blorp"
 * }
 * ````
 * 
 * ## Response SymbolsValues returned (or thrown) by a handler or middleware may be annotated with
 * [symbols]( "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol") to control response behavior. See the [chapter on "handlers"]( "@/concepts/01-handlers.md#responses") for more.
 * A complete list of symbols and transformations follows.
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/02-handlers#url")*/
    get url() {
        if (this._parsedUrl) {
            return this._parsedUrl;
        }
        this._parsedUrl = new URL(String(this.request.url), `http://${this.headers.host || 'example.com'}`);
        return this._parsedUrl;
    }
    /**{{ changelog(version = "0.0.0") }}
 * 
 * A [`URL`]( "https://developer.mozilla.org/en-US/docs/Web/API/URL_API") instance populated with the `host` header & incoming request path information.
 * This attribute may be set to a `String` in order to recalculate the `url` and `query`
 * properties.
 * 
 * **Example use:**
 * 
 * ````javascript
 * uniformResourceLocation.route = 'GET /'
 * async function uniformResourceLocation(context) {
 *   console.log(context.url.pathname) // "/"
 * 
 *   context.url = '/foo/bar?baz=blorp'
 *   console.log(context.url.pathname) // "/foo/bar"
 *   console.log(context.query.baz) // "blorp"
 * }
 * ````
 * 
 * ## Response SymbolsValues returned (or thrown) by a handler or middleware may be annotated with
 * [symbols]( "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol") to control response behavior. See the [chapter on "handlers"]( "@/concepts/01-handlers.md#responses") for more.
 * A complete list of symbols and transformations follows.
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/02-handlers#url")*/
    set url(value) {
        this._query = undefined;
        if (value instanceof URL) {
            this._parsedUrl = value;
            this.request.url = this._parsedUrl.pathname + this._parsedUrl.search;
        }
        else {
            this._parsedUrl = undefined;
            this.request.url = value;
        }
    }
    /**{{ changelog(version = "0.0.0") }}
 * 
 * `query` contains the URL search (or "query") parameters for the current
 * request, available as a plain javascript object.
 * 
 * If `context.url` is set to a new string, `context.query` is re-calculated.
 * 
 * **Warning**: Duplicated querystring keys are dropped from this
 * object; only the last key/value pair is available. If you
 * need to preserve *exact* querystring information, use
 * `context.url.searchParams`, which is a [`URLSearchParams`]( "https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams")
 * object.
 * 
 * **Example use:**
 * 
 * ````javascript
 * queries.route = 'GET /'
 * async function queries(context) {
 *   if (context.query.foo) {
 *     // if you requested this handler with "/?foo=1&bar=gary&bar=busey",
 *     // you would get "busey" as a result
 *     return context.query.bar
 *   }
 * }
 * ````
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/02-handlers#query")*/
    get query() {
        this._query = this._query || Object.fromEntries(this.url.searchParams);
        return this._query;
    }
    /**{% changelog(version = "0.0.0") %}
 * 
 * * **Changed in 0.5.0:** `body` may be set by the user and the result will be retained. 
 *   {% end %}
 * 
 * A promise for the parsed contents of the request body. This promise resolves to
 * a JavaScript object on success or throws a `422 Unprocessable Entity` error when
 * no body parser could handle the request body.
 * 
 * See ["accepting user input"]( "@/concepts/04-accepting-input.md") for more.
 * 
 * **Example use:**
 * 
 * ````javascript
 * myHandler.route = 'POST /foo'
 * async function myHandler(context) {
 *   const body = await context.body
 *   // do something with the body
 *   if (body.flub) {
 *     return body.blarp
 *   }
 * }
 * ````
 * 
 * ---
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/02-handlers#body")*/
    get body() {
        if (this._body) {
            return this._body;
        }
        this._body = Promise.resolve(this.handler.bodyParser(this.request));
        return this._body;
    }
    /**{% changelog(version = "0.0.0") %}
 * 
 * * **Changed in 0.5.0:** `body` may be set by the user and the result will be retained. 
 *   {% end %}
 * 
 * A promise for the parsed contents of the request body. This promise resolves to
 * a JavaScript object on success or throws a `422 Unprocessable Entity` error when
 * no body parser could handle the request body.
 * 
 * See ["accepting user input"]( "@/concepts/04-accepting-input.md") for more.
 * 
 * **Example use:**
 * 
 * ````javascript
 * myHandler.route = 'POST /foo'
 * async function myHandler(context) {
 *   const body = await context.body
 *   // do something with the body
 *   if (body.flub) {
 *     return body.blarp
 *   }
 * }
 * ````
 * 
 * ---
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/02-handlers#body")*/
    set body(v) {
        this._body = Promise.resolve(v);
    }
    /**{{ changelog(version = "0.0.0") }}
 * 
 * [Content negotiation]( "https://developer.mozilla.org/en-US/docs/Web/HTTP/Content_negotiation") support for the request. Provided by the [`accepts`]( "https://github.com/jshttp/accepts") package.
 * This property is lazily instantiated on access.
 * 
 * **Example use:**
 * 
 * ````javascript
 * myHandler.route = 'GET /foo'
 * function myHandler(context) {
 *   switch (context.accepts.type(['json', 'html'])) {
 *     case 'json':
 *       return {'hello': 'world'}
 *     case 'html':
 *       const res = Buffer.from(`<h1>hello world</h1>`)
 *       res[Symbol.for('headers')] = {
 *         'content-type': 'text/html'
 *       }
 *       return res
 *     default:
 *       // default to text/plain
 *       return 'hello world'
 *   }
 * }
 * ````
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/02-handlers#accepts")*/
    get accepts() {
        if (this._accepts) {
            return this._accepts;
        }
        this._accepts = accepts(this.request);
        return this._accepts;
    }
}
void ``;
void ``;

void ``;
/**{{ changelog(version = "0.1.1") }}
 * 
 * A specialized [`Map`]( "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map") instance allowing access to [HTTP Cookie]( "https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies") information.
 * `.cookie` supports `.get`, `.set`, `.delete`, `.has`, and all other `Map`
 * methods.
 * 
 * `.cookie` maps cookie names (as strings) to cookie configurations:
 * 
 * ````js
 * {
 *   httpOnly: Boolean, // defaults to true
 *   expires: Date,
 *   maxAge: Number,
 *   secure: Boolean, // defaults to true in production, false in development mode
 *   sameSite: true,  // defaults to true
 *   value: String
 * }
 * ````
 * 
 * This configuration information is passed to the [`cookie`]( "https://github.com/jshttp/cookie#readme") package in order to
 * create [`Set-Cookie`]( "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie") headers for outgoing responses.
 * 
 * Boltzmann tracks the state of the cookie map; if any values change or are
 * deleted, Boltzmann automatically generates and attaches a `Set-Cookie` header to
 * responses.
 * 
 * Incoming cookies don't contain enough information to recreate fields other than
 * `.value`, so those values are synthesized with defaults.
 * 
 * **Example use:**
 * 
 * ````javascript
 * logout.route = 'POST /foo'
 * async function logout(context) {
 *   const { value } = context.cookie.get('sessionid') || {}
 *   if (value) {
 *     cookie.delete('sessionid')
 *   }
 * }
 * 
 * const uuid = require('uuid')
 * 
 * login.route = 'POST /login'
 * async function login(context) {
 *   const {username} = await context.body
 *   const id = uuid.v4()
 *   context.redisClient.set(id, username)
 * 
 *   context.cookie.set('sessionid', {
 *     value: username,
 *     maxAge: 60 // 1 minute! HOW VERY SECURE
 *   })
 * }
 * ````
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/02-handlers#cookie")*/
class Cookie extends Map {
    constructor(values) {
        super(values);
        this.changed = new Set();
    }
    set(key, value) {
        if (this.changed) {
            this.changed.add(key);
        }
        const defaults = {
            sameSite: true,
            secure: !isDev(),
            httpOnly: true,
        };
        return super.set(key, typeof value === 'string' ? {
            ...defaults,
            value
        } : {
            ...defaults,
            ...value
        });
    }
    delete(key) {
        this.changed.add(key);
        return super.delete(key);
    }
    collect() {
        const cookies = [];
        for (const key of this.changed) {
            if (this.has(key)) {
                const result = this.get(key);
                if (!result) {
                    throw new TypeError('invalid data in cookie');
                }
                const { value, ...opts } = result;
                cookies.push(cookie.serialize(key, value, opts));
            }
            else {
                cookies.push(cookie.serialize(key, 'null', {
                    httpOnly: true,
                    expires: new Date(),
                    maxAge: 0
                }));
            }
        }
        return cookies;
    }
    static from(string) {
        return new Cookie(Object.entries(cookie.parse(string)));
    }
}
void ``;
void ``;

void ``;
/**{{ changelog(version = "0.1.4") }}
 * 
 * A [`Promise`]( "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise") for a `Session` object. `Session` objects are subclasses of the built-in
 * [`Map`]( "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map") class. `Session` objects provide all of the built-in `Map` methods, and additionally offers:
 * 
 * * `.reissue()`: For existing sessions, regenerates the session id and issues it to the client. Has no
 *   effect for new sessions (the session id does not exist to be regenerated.) Use this when authentication
 *   levels change for a session: logging a user in or out should reissue the session cookie.
 * 
 * You can store any JavaScript object in session storage. **However,** session storage is serialized as
 * JSON, so rich type information will be lost.
 * 
 * **Example use:**
 * 
 * ````javascript
 * sessions.route = 'GET /'
 * async function sessions(context) {
 *   const session = await context.session
 *   const username = session.get('user')
 * 
 *   return username ? 'wow, you are very logged in' : 'not extremely online'
 * }
 * 
 * logout.route = 'POST /logout'
 * async function logout(context) {
 *   const session = await context.session
 *   session.delete('user')
 *   session.reissue() // The user is no longer authenticated. Switch the session storage to a new ID.
 * 
 *   return Object.assign(Buffer.from([]), {
 *     [Symbol.for('status')]: 301,
 *     [Symbol.for('headers')]: {
 *       'location': '/'
 *     }
 *   })
 * }
 * ````
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/02-handlers#session")*/
class Session extends Map {
    constructor(id, ...args) {
        super(...args);
        this.id = id;
        this.dirty = false;
        this[REISSUE] = false;
    }
    reissue() {
        this[REISSUE] = true;
    }
    set(key, value) {
        const old = this.get(key);
        if (value === old) {
            return super.set(key, value);
        }
        this.dirty = true;
        return super.set(key, value);
    }
    delete(key) {
        if (!this.has(key)) {
            return super.delete(key);
        }
        this.dirty = true;
        return super.delete(key);
    }
}
void ``;

void ``;
class BadSessionError extends Error {
    constructor() {
        super("Invalid session cookie");
        this[STATUS] = 400;
    }
}
class NoMatchError extends Error {
    constructor(method, pathname) {
        super(`Could not find route for ${method} ${pathname}`);
        this.__noMatch = true;
        this[STATUS] = 404;
        Error.captureStackTrace(this, NoMatchError);
    }
}
void ``;




void ``;
async function runserver({ middleware = _requireOr('./middleware', []).then(_processMiddleware), bodyParsers = _requireOr('./body', [urlEncoded, json]).then(_processBodyParsers), handlers = _requireOr('./handlers', {}), } = {}) {
    const [resolvedMiddleware, resolvedBodyParsers, resolvedHandlers] = await Promise.all([
        middleware,
        bodyParsers,
        handlers,
    ]);
    const server = http.createServer();
    let isClosing = false;
    // When we're not in dev, handle SIGINT gracefully. Gracefully let open
    // connections complete, but let them know not to keep-alive!
    if (!isDev()) {
        process.on('SIGINT', () => {
            if (isClosing) {
                process.exit(1);
            }
            const logger = bole('boltzmann:server');
            logger.info('Caught SIGINT, preparing to shutdown. If running on the command line another ^C will close the app immediately.');
            isClosing = true;
            server.close();
        });
    }
    Context._bodyParser = buildBodyParser(resolvedBodyParsers);
    const respond = await buildMiddleware([[route, resolvedHandlers], ...resolvedMiddleware], handler);
    // 
    let _middleware = [];
    if (isDev() && !process.env.TAP) {
        const getFunctionLocation = require('get-function-location');
        _middleware = await Promise.all(resolvedMiddleware.map(async (xs) => {
            const fn = (Array.isArray(xs) ? xs[0] : xs);
            const loc = await getFunctionLocation(fn);
            return {
                name: String(fn.name),
                location: `${loc.source.replace('file://', 'vscode://file')}:${loc.line}:${loc.column}`
            };
        }));
    }
    // 
    server.on('request', async (req, res) => {
        const context = new Context(req, res);
        // 
        if (isDev()) {
            context._handlers = resolvedHandlers;
            context._middleware = _middleware;
        }
        // 
        let body = await respond(context);
        if (body[THREW]) {
            body = {
                message: body.message,
                [isDev() ? 'stack' : Symbol('stack')]: body.stack,
                [STATUS]: body[STATUS],
                [HEADERS]: body[HEADERS],
                ...body
            };
        }
        const isPipe = body && body.pipe;
        const { [STATUS]: status, [HEADERS]: headers, } = body || {};
        if (context.hasCookie) {
            const setCookie = context.cookie.collect();
            if (setCookie.length) {
                headers['set-cookie'] = setCookie;
            }
        }
        headers['x-clacks-overhead'] = 'GNU/Terry Pratchett';
        if (isClosing) {
            headers.connection = isClosing ? 'close' : 'keep-alive';
        }
        res.writeHead(status, headers);
        if (isPipe) {
            body.pipe(res);
        }
        else if (Buffer.isBuffer(body)) {
            res.end(body);
        }
        else if (body) {
            res.end(JSON.stringify(body));
        }
        else {
            res.end();
        }
    });
    return server;
}
void ``;


void ``;
async function printRoutes() {
    const metadata = await routes(await _requireOr('./handlers', {}));
    const maxRouteLen = metadata.reduce((acc, { route }) => Math.max(acc, route.length), 0);
    const maxHandlerLen = metadata.reduce((acc, { handler, key }) => Math.max(acc, (handler.name || key).length), 0);
    const maxMethodLen = metadata
        .map(({ method }) => [].concat(method))
        .flat()
        .reduce((acc, method) => Math.max(acc, method.length), 0);
    const map = {
        'GET': '\x1b[32;1m',
        'DELETE': '\x1b[31m',
        'POST': '\x1b[33;1m',
        'PATCH': '\x1b[33;1m',
        'PUT': '\x1b[35;1m',
        '*': '\x1b[36;1m'
    };
    const ansi = require('ansi-escapes');
    const supportsHyperlinks = require('supports-hyperlinks');
    for (const meta of metadata) {
        for (let originalMethod of meta.method) {
            let method = originalMethod.toUpperCase().trim();
            method = `${(map[originalMethod] || map['*'])}${originalMethod}\x1b[0m`;
            method = method + ' '.repeat(Math.max(0, maxMethodLen - originalMethod.length + 1));
            const rlen = meta.route.trim().length;
            const route = meta.route.trim().replace(/:([^\/-]+)/g, (_, m) => {
                return `\x1b[4m:${m}\x1b[0m`;
            }) + ' '.repeat(Math.max(0, maxRouteLen - rlen) + 1);
            const handler = (meta.handler.name || meta.key).padEnd(maxHandlerLen + 1);
            const source = meta.location.source.replace(`file://${process.cwd()}`, '.');
            let filename = `${source}:${meta.location.line}:${meta.location.column}`;
            filename = (supportsHyperlinks.stdout
                ? ansi.link(filename, meta.link)
                : filename);
            console.log(`  ${method}${route}${handler} \x1b[38;5;8m(\x1b[4m${filename}\x1b[0m\x1b[38;5;8m)\x1b[0m`);
        }
    }
    if (supportsHyperlinks.stdout) {
        console.log();
        console.log('(hold ⌘ and click on any filename above to open in VSCode)');
    }
    console.log();
}




void ``;
/**{{ changelog(version = "0.0.0") }}
 * 
 * The `json` body parser parses [json]( "https://mdn.io/json") request bodies, identified
 * by the `Content-Type` request header. Any request with a `Content-Type` which does not
 * satisfy `application/json` will be skipped.
 * 
 * Examples of content types which will be parsed:
 * 
 * * `application/json; charset=UTF-8`
 * * `application/json`
 * * `application/vnd.NPM.corgi+json`
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/04-body-parsers#json")*/
function json(next) {
    return async (request) => {
        if (request.contentType.type === 'application' &&
            request.contentType.subtype === 'json' &&
            request.contentType.charset === 'utf-8') {
            const buf = await _collect(request);
            try {
                return JSON.parse(String(buf));
            }
            catch {
                const message = (isDev()
                    ? 'Could not parse request body as JSON (Did the request include a `Content-Type: application/json` header?)'
                    : 'Could not parse request body as JSON');
                throw Object.assign(new Error(message), {
                    [STATUS]: 422
                });
            }
        }
        return next(request);
    };
}
void ``;

void ``;
/**{{ changelog(version = "0.0.0") }}
 * 
 * The `urlEncoded` body parser parses [urlencoded]( "https://mdn.io/urlencoded") request bodies,
 * identified by the `Content-Type` request header. Any request with a `Content-Type` which does
 * not satisfy `application/x-www-form-urlencoded` will be skipped.
 * 
 * Examples of content types which will be parsed:
 * 
 * * `application/x-www-form-urlencoded`
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/04-body-parsers#urlencoded")*/
function urlEncoded(next) {
    return async (request) => {
        if (request.contentType.type !== 'application' ||
            request.contentType.subtype !== 'x-www-form-urlencoded' ||
            request.contentType.charset !== 'utf-8') {
            return next(request);
        }
        const buf = await _collect(request);
        // XXX: AFAICT there's no way to get the querystring parser to throw, hence
        // the lack of a try/catch here.
        return querystring.parse(String(buf));
    };
}
void ``;




void ``;
function applyHeaders(headers = {}) {
    return (next) => {
        return async function xfo(context) {
            const result = await next(context);
            Object.assign(result[Symbol.for('headers')], headers);
            return result;
        };
    };
}
function applyXFO(mode) {
    if (!['DENY', 'SAMEORIGIN'].includes(mode)) {
        throw new Error('applyXFO(): Allowed x-frame-options directives are DENY and SAMEORIGIN.');
    }
    return applyHeaders({ 'x-frame-options': mode });
}
void ``;

void ``;
const hangWarning = Symbol('hang-stall');
const hangError = Symbol('hang-error');
function dev(nextName, warnAt = Number(process.env.DEV_LATENCY_WARNING_MS) || 500, errorAt = Number(process.env.DEV_LATENCY_ERROR_MS) || 2000) {
    return function devMiddleware(next) {
        return async function inner(context) {
            const req = context.request;
            if (context[hangWarning]) {
                clearTimeout(context[hangWarning]);
            }
            context[hangWarning] = setTimeout(() => {
                console.error(`⚠️ Response from ${nextName} > ${warnAt}ms fetching "${req.method} ${req.url}".`);
                console.error('\x1b[037m - (Tune timeout using DEV_LATENCY_WARNING_MS env variable.)\x1b[00m');
            }, warnAt);
            if (context[hangError]) {
                clearTimeout(context[hangError]);
            }
            context[hangError] = setTimeout(() => {
                console.error(`🛑 STALL: Response from ${nextName} > ${errorAt}ms: "${req.method} ${req.url}". (Tune timeout using DEV_LATENCY_ERROR_MS env variable.)`);
                console.error('\x1b[037m - (Tune timeout using DEV_LATENCY_ERROR_MS env variable.)\x1b[00m');
            }, errorAt);
            const result = await next(context);
            clearTimeout(context[hangWarning]);
            context[hangWarning] = null;
            clearTimeout(context[hangError]);
            context[hangError] = null;
            return result;
        };
    };
}
void ``;

void ``;
// csrf protection middleware
function signCookie(value, secret) {
    return `${value}.${crypto.createHmac('sha256', secret).update(value).digest('base64')}`;
}
function checkCookieSignature(input, secret) {
    if (!input) {
        return false;
    }
    const [message,] = input.split('.', 2);
    const valid = signCookie(message, secret);
    if (valid.length !== input.length) {
        return false;
    }
    return crypto.timingSafeEqual(Buffer.from(input), Buffer.from(valid)) ? message : false;
}
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
function applyCSRF({ cookieSecret = process.env.COOKIE_SECRET, csrfCookie = '_csrf', param = '_csrf', header = 'csrf-token' } = {}) {
    if (!cookieSecret) {
        throw new Error('You cannot use CSRF middleware without providing a secret for signing cookies');
    }
    return (next) => {
        const tokens = new CsrfTokens();
        return async function csrf(context) {
            // set up context for handler, with intentional hoist
            context.csrfToken = csrfToken;
            var secret = fetchSecretFromCookie();
            var token = undefined;
            if (!secret) {
                secret = generateNewSecretCookie();
            }
            if (READ_METHODS.has(String(context.method))) {
                return next(context);
            }
            const body = await context.body;
            const tk = (body && body[param]) || context.headers[header];
            if (!tokens.verify(secret, tk)) {
                throw Object.assign(new Error('Invalid CSRF token'), {
                    [Symbol.for('status')]: 403
                });
            }
            return next(context);
            function generateNewSecretCookie() {
                const newSecret = tokens.secretSync();
                const signed = signCookie(newSecret, String(cookieSecret));
                context.cookie.set(csrfCookie, signed);
                return newSecret;
            }
            function fetchSecretFromCookie() {
                const candidate = context.cookie.get(csrfCookie);
                if (!candidate) {
                    return undefined;
                }
                return checkCookieSignature(candidate.value, String(cookieSecret));
            }
            // Handlers can call this to get a token to use on relevant requests.
            // It creates a token-generating secret for the user if they don't have one
            // already, and makes a new token.
            function csrfToken({ refresh = false } = {}) {
                const freshSecret = fetchSecretFromCookie();
                // We might be coming through here more than once.
                // Re-use the token if we can, but generate a new one if the secret in the cookie changed.
                if (!refresh && token && (freshSecret === secret)) {
                    return token;
                }
                if (!freshSecret) {
                    secret = generateNewSecretCookie(); // changes value in the closure
                }
                token = tokens.create(String(secret)); // changes value in the closure
                return token;
            }
        };
    };
}
void ``;

void ``;
function handleCORS({ origins = isDev() ? '*' : String(process.env.CORS_ALLOW_ORIGINS || '').split(','), methods = String(process.env.CORS_ALLOW_METHODS || '').split(','), headers = String(process.env.CORS_ALLOW_HEADERS || '').split(',') }) {
    const originsArray = Array.isArray(origins) ? origins : [origins];
    const includesStar = originsArray.includes('*');
    return (next) => {
        return async function cors(context) {
            const spanAttributes = {
                'boltzmann.http.origin': String(context.headers.origin)
            };
            if (honeycomb.features.beeline) {
                beeline.addContext(spanAttributes);
            }
            const span = otel.trace.getSpan(otel.context.active());
            if (span) {
                span.setAttributes(spanAttributes);
            }
            if (!includesStar && !originsArray.includes(String(context.headers.origin))) {
                throw Object.assign(new Error('Origin not allowed'), {
                    [Symbol.for('status')]: 400
                });
            }
            const response = (context.method === 'OPTIONS'
                ? Object.assign(Buffer.from(''), {
                    [Symbol.for('status')]: 204,
                })
                : await next(context));
            response[Symbol.for('headers')] = {
                'Access-Control-Allow-Origin': includesStar ? '*' : context.headers.origin,
                'Access-Control-Allow-Methods': [].concat(methods).join(','),
                'Access-Control-Allow-Headers': [].concat(headers).join(',')
            };
            return response;
        };
    };
}
void ``;

void ``;
function enforceInvariants() {
    return function invariantMiddleware(next) {
        // the "...args" here are load-bearing: this is applied between
        // decorators _and_ middleware
        return async function invariant(ctx) {
            let error, result;
            try {
                result = await next(ctx);
            }
            catch (err) {
                error = err;
            }
            const body = error || result || '';
            const isPipe = body && body.pipe;
            const { [STATUS]: status = error ? 500 : result ? 200 : 204, [HEADERS]: headers = {}, } = body || {};
            if (!headers['content-type']) {
                if (typeof body === 'string') {
                    headers['content-type'] = 'text/plain; charset=utf-8';
                }
                else if (isPipe) {
                    headers['content-type'] = 'application/octet-stream';
                }
                else {
                    // 
                    if (body && body[TEMPLATE]) {
                        headers['content-type'] = 'text/html; charset=utf-8';
                    }
                    else {
                        headers['content-type'] = 'application/json; charset=utf-8';
                    }
                    // 
                }
            }
            if (error) {
                error[STATUS] = status;
                error[HEADERS] = headers;
                error[THREW] = true;
                return error;
            }
            if (result && typeof result === 'object') {
                result[STATUS] = status;
                result[HEADERS] = headers;
                return result;
            }
            if (!result) {
                result = '';
            }
            const stream = Buffer.from(String(result), 'utf8');
            stream[STATUS] = status;
            stream[HEADERS] = headers;
            return stream;
        };
    };
}


void ``;
function traceName(method, pathname) {
    return `${method} ${pathname}`;
}
function middlewareSpanName(name) {
    return `mw: ${name || '<unknown>'}`;
}
function paramSpanAttribute(param) {
    return `boltzmann.http.request.param.${param}`;
}
module.exports = {...module.exports,  traceName, middlewareSpanName, paramSpanAttribute };
// The trace middleware creates a request-level span or trace. It delegates
// to either a beeline or OpenTelemetry implementation depending on how
// the honeycomb object is configured.
trace.doNotTrace = true;
function trace({ headerSources = ['x-honeycomb-trace', 'x-request-id'], } = {}) {
    if (!honeycomb.features.honeycomb || !honeycomb.initialized) {
        return (next) => (context) => next(context);
    }
    if (honeycomb.features.beeline) {
        return beelineTrace({ headerSources });
    }
    // Note: headerSources is not respected by otel tracing!
    return otelTrace();
}
// The spans middleware creates a span on top of nested middleware, injected
// between middlewares in the core buildMiddleware step. It delegates to
// either a beeline or OpenTelemetry implementation depending on how the
// honeycomb object is configured.
function honeycombMiddlewareSpans({ name, doNotTrace } = {}) {
    if (!honeycomb.features.honeycomb || doNotTrace) {
        return (next) => (context) => next(context);
    }
    if (honeycomb.features.beeline) {
        return beelineMiddlewareSpans({ name });
    }
    return otelMiddlewareSpans({ name });
}
// Beeline implementations of trace and span, respectively.
function beelineTrace({ headerSources = ['x-honeycomb-trace', 'x-request-id'], } = {}) {
    const schema = require('honeycomb-beeline/lib/schema');
    const tracker = require('honeycomb-beeline/lib/async_tracker');
    return function honeycombTrace(next) {
        return (context) => {
            const traceContext = _getTraceContext(context);
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
                'honeycomb.trace_type': 'beeline'
            }, traceContext.traceId, traceContext.parentSpanId, traceContext.dataset);
            if (isDev()) {
                context._honeycombTrace = trace;
            }
            if (traceContext.customContext) {
                beeline.addContext(traceContext.customContext);
            }
            if (!trace) {
                return next(context);
            }
            const boundFinisher = beeline.bindFunctionToTrace((response) => {
                beeline.addContext({
                    'response.status_code': String(response.statusCode)
                });
                beeline.addContext({
                    'request.route': context.handler.route,
                    'request.method': context.handler.method,
                    'request.version': context.handler.version
                });
                const params = Object.entries(context.params).map(([key, value]) => {
                    return [`request.param.${key}`, value];
                });
                beeline.addContext(Object.fromEntries(params));
                beeline.finishTrace(trace);
            });
            // do not do as I do,
            onHeaders(context._response, function () {
                return boundFinisher(this, tracker.getTracked());
            });
            return next(context);
        };
    };
    function _getTraceContext(context) {
        const source = headerSources.find(header => header in context.headers);
        if (!source || !context.headers[source]) {
            return {};
        }
        if (source === 'x-honeycomb-trace') {
            const data = beeline.unmarshalTraceContext(context.headers[source]);
            if (!data) {
                return {};
            }
            return Object.assign({}, data, { source: `${source} http header` });
        }
        return {
            traceId: context.headers[source],
            source: `${source} http header`
        };
    }
}
function beelineMiddlewareSpans({ name } = {}) {
    return function honeycombSpan(next) {
        return async (context) => {
            const span = beeline.startSpan({
                name: middlewareSpanName(name)
            });
            beeline.addContext({
                [otelSemanticConventions.SemanticResourceAttributes.SERVICE_NAME]: honeycomb.options.serviceName,
                'honeycomb.trace_type': 'beeline'
            });
            // Assumption: the invariant middleware between each layer
            // will ensure that no errors are thrown from next().
            const result = await next(context);
            beeline.finishSpan(span);
            return result;
        };
    };
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
function otelTrace() {
    return function honeycombTrace(next) {
        return (context) => {
            let traceContext = otel.context.active();
            // Typically, HTTP auto-instrumentation will create a parent span for us
            let span = otel.trace.getSpan(traceContext);
            // startSpan should always return a span, but as far as typescript is
            // concerned the span could still be undefined. We could assert that it
            // exists, but throwing instrumentation-related errors is poor form.
            if (span) {
                span.setAttribute('boltzmann.http.query', context.url.search);
                span.updateName(traceName(context.method, context.url.pathname));
                traceContext = otel.trace.setSpan(traceContext, span);
                if (isDev()) {
                    context._honeycombTrace = span;
                }
            }
            else {
                otel.diag.error(String(new assert.AssertionError({
                    message: 'no parent span found or created',
                    actual: span,
                    expected: true,
                    operator: '=='
                }).stack));
            }
            onHeaders(context._response, function () {
                const handler = context.handler;
                if (!span) {
                    return;
                }
                span.setAttribute(otelSemanticConventions.SemanticResourceAttributes.SERVICE_VERSION, handler.version);
                Object.entries(context.params).forEach(([key, value]) => {
                    if (span) {
                        span.setAttribute(paramSpanAttribute(key), value);
                    }
                });
            });
            return otel.context.with(traceContext, () => {
                return next(context);
            });
        };
    };
}
function otelMiddlewareSpans({ name } = {}) {
    return function honeycombSpan(next) {
        return async (context) => {
            let traceContext = otel.context.active();
            const span = honeycomb.tracer.startSpan(middlewareSpanName(name), { kind: otel.SpanKind.SERVER }, traceContext);
            traceContext = otel.trace.setSpan(traceContext, span);
            const result = await otel.context.with(traceContext, () => {
                return next(context);
            });
            span.end();
            return result;
        };
    };
}
void ``;



void ``;
function log({ logger = bole(serviceName), 
// 
honeycombLogger = bole(`${serviceName}:honeycomb`), 
// 
level = process.env.LOG_LEVEL || 'debug', stream = process.stdout, } = {}) {
    if (isDev()) {
        const pretty = require('bistre')({ time: true });
        pretty.pipe(stream);
        stream = pretty;
    }
    bole.output({ level, stream });
    void ``;
    honeycomb.logger = honeycombLogger;
    const hasWriteKey = Boolean(honeycomb.options.writeKey && honeycomb.options.writeKey.length);
    let honeycombConfig = {
        serviceName: honeycomb.options.serviceName,
        writeKey: `${hasWriteKey ? "DEFINED" : "NOT DEFINED"}`,
        dataset: honeycomb.options.dataset
    };
    Object.assign(honeycombConfig, honeycomb.features);
    honeycombLogger.debug({
        message: 'Honeycomb tracing enabled',
        ...honeycombConfig
    });
    void ``;
    return function logMiddleware(next) {
        return async function inner(context) {
            const result = await next(context);
            const body = result || {};
            if (body && body[THREW] && body.stack) {
                logger.error(body);
            }
            logger.info({
                message: `${body[Symbol.for('status')]} ${context.request.method} ${context.request.url}`,
                id: context.id,
                ip: context.remote,
                host: context.host,
                method: context.request.method,
                url: context.request.url,
                elapsed: Date.now() - context.start,
                status: body[Symbol.for('status')],
                userAgent: context.request.headers['user-agent'],
                referer: context.request.headers.referer
            });
            return body;
        };
    };
}
void ``;


void ``;
handlePing.doNotTrace = true;
function handlePing() {
    return (next) => (context) => {
        if (context.url.pathname === '/monitor/ping') {
            return ship;
        }
        return next(context);
    };
}


void ``;
/**This middleware is attached when the [redis feature]( "@/reference/01-cli.md#redis") is enabled.
 * It adds a configured, promisified Redis client to the context object accessible via the
 * getter `context.redisClient`. This object is a [handy-redis]( "https://github.com/mmkal/handy-redis")
 * client with a promisified API. The environment variable `REDIS_URL` is passed to the handy-redis
 * constructor.
 * 
 * ---
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/03-middleware#attachredis")*/
function attachRedis({ url = process.env.REDIS_URL } = {}) {
    return (next) => {
        const client = redis.createHandyClient({ url });
        return async function redis(context) {
            context._redisClient = client;
            return next(context);
        };
    };
}
void ``;

void ``;
function route(handlers = {}) {
    const wayfinder = fmw({});
    return async (next) => {
        for (let handler of Object.values(handlers)) {
            if (typeof handler.route === 'string') {
                let [method, ...routeParts] = handler.route.split(' ');
                let route = routeParts.join(' ');
                if (route.length === 0) {
                    route = method;
                    method = (handler.method || 'GET');
                }
                const opts = {};
                if (handler.version) {
                    opts.constraints = { version: handler.version };
                    handler.middleware = handler.middleware || [];
                    handler.middleware.push([vary, 'accept-version']);
                }
                const { version, middleware, decorators, bodyParsers, ...rest } = handler;
                let location = null;
                // 
                if (isDev() && !process.env.TAP) {
                    const getFunctionLocation = require('get-function-location');
                    const loc = await getFunctionLocation(handler);
                    location = `${loc.source.replace('file://', 'vscode://file')}:${loc.line}:${loc.column}`;
                }
                // 
                if (Array.isArray(decorators)) {
                    handler = await decorators.reduce((lhs, rhs) => {
                        return [...lhs, enforceInvariants(), rhs];
                    }, []).reduceRight(async (lhs, rhs) => rhs(await lhs), Promise.resolve(enforceInvariants()(handler)));
                }
                const bodyParser = (Array.isArray(bodyParsers)
                    ? buildBodyParser(bodyParsers)
                    : Context._bodyParser);
                if (Array.isArray(middleware)) {
                    const name = handler.name;
                    handler = await buildMiddleware(middleware, handler);
                    // preserve the original name, please
                    Object.defineProperty(handler, 'name', { value: name });
                }
                Object.assign(handler, {
                    ...rest,
                    method: handler.method || method || 'GET',
                    version,
                    route,
                    location,
                    bodyParser,
                    middleware: (middleware || []).map(xs => Array.isArray(xs) ? xs[0].name : xs.name),
                    decorators: (decorators || []).map(xs => xs.name),
                });
                wayfinder.on(method, route, opts, handler);
            }
        }
        return (context) => {
            const { pathname } = context.url;
            const method = context.request.method || 'GET';
            const match = wayfinder.find(method, pathname, ...(context.request.headers['accept-version']
                ? [{ version: context.request.headers['accept-version'] }]
                : [{ version: '' }]));
            if (!match) {
                return next(context);
            }
            context.params = match.params;
            context.handler = match.handler;
            return next(context);
        };
    };
}

void ``;
let IN_MEMORY = new Map();
const inMemorySessionLoad = async (_, id) => JSON.parse(IN_MEMORY.get(id));
const redisSessionLoad = async (context, id) => {
    return JSON.parse(await context.redisClient.get(id) || '{}');
};
const inMemorySessionSave = async (_, id, session) => {
    IN_MEMORY.set(id, JSON.stringify(session));
};
const redisSessionSave = async (context, id, session, expirySeconds) => {
    await context.redisClient.setex(id, expirySeconds + 5, JSON.stringify(session));
};
let defaultSessionLoad = inMemorySessionLoad;
// 
defaultSessionLoad = redisSessionLoad;
// 
let defaultSessionSave = inMemorySessionSave;
// 
defaultSessionSave = redisSessionSave;
// 
function session({ cookie = process.env.SESSION_ID || 'sid', secret = process.env.SESSION_SECRET, salt = process.env.SESSION_SALT, logger = bole('boltzmann:session'), load = defaultSessionLoad, save = defaultSessionSave, iron = {}, cookieOptions = {}, expirySeconds = 60 * 60 * 24 * 365 } = {}) {
    expirySeconds = Number(expirySeconds) || 0;
    if (typeof load !== 'function') {
        throw new TypeError('`load` must be a function, got ' + typeof load);
    }
    if (typeof save !== 'function') {
        throw new TypeError('`save` must be a function, got ' + typeof save);
    }
    secret = Buffer.isBuffer(secret) ? secret : String(secret);
    if (secret.length < 32) {
        throw new RangeError('`secret` must be a string or buffer at least 32 units long');
    }
    salt = Buffer.isBuffer(salt) ? salt : String(salt);
    if (salt.length == 0) {
        throw new RangeError('`salt` must be a string or buffer at least 1 unit long; preferably more');
    }
    return (next) => {
        return async (context) => {
            let _session;
            context._loadSession = async () => {
                if (_session) {
                    return _session;
                }
                const sessid = context.cookie.get(cookie);
                if (!sessid) {
                    _session = new Session(null, [['created', Date.now()]]);
                    return _session;
                }
                let clientId;
                try {
                    clientId = String(await unseal(sessid.value, String(secret), { ...ironDefaults, ...iron }));
                }
                catch (err) {
                    logger.warn(`removing session that failed to decrypt; request_id="${context.id}"`);
                    _session = new Session(null, [['created', Date.now()]]);
                    return _session;
                }
                if (!clientId.startsWith('s_') || !uuid.validate(clientId.slice(2).split(':')[0])) {
                    logger.warn(`caught malformed session; clientID="${clientId}"; request_id="${context.id}"`);
                    throw new BadSessionError();
                }
                const id = `s:${crypto.createHash('sha256').update(clientId).update(String(salt)).digest('hex')}`;
                const sessionData = await load(context, id);
                _session = new Session(clientId, Object.entries(sessionData));
                return _session;
            };
            const response = await next(context);
            if (!_session) {
                return response;
            }
            if (!_session.dirty) {
                return response;
            }
            const needsReissue = !_session.id || _session[REISSUE];
            const issued = Date.now();
            const clientId = needsReissue ? `s_${uuid.v4()}:${issued}` : _session.id;
            const id = `s:${crypto.createHash('sha256').update(clientId).update(salt).digest('hex')}`;
            _session.set('modified', issued);
            await save(context, id, Object.fromEntries(_session.entries()), expirySeconds);
            if (needsReissue) {
                const sealed = await seal(clientId, secret, { ...ironDefaults, ...iron });
                context.cookie.set(cookie, {
                    value: sealed,
                    httpOnly: true,
                    sameSite: true,
                    maxAge: expirySeconds,
                    ...(expirySeconds ? {} : { expires: new Date(Date.now() + 1000 * expirySeconds) }),
                    ...cookieOptions
                });
            }
            return response;
        };
    };
}
void ``;


void ``;
function templateContext(extraContext = {}) {
    return (next) => {
        return async (context) => {
            const result = await next(context);
            if (Symbol.for('template') in result) {
                result.STATIC_URL = process.env.STATIC_URL || '/static';
                for (const [key, fn] of Object.entries(extraContext)) {
                    result[key] = typeof fn === 'function' ? await fn(context) : fn;
                }
            }
            return result;
        };
    };
}

void ``;
const defaultReachability = {};
// 
// 
defaultReachability.redisReachability = redisReachability;
// 
function handleStatus({ git = process.env.GIT_COMMIT, reachability = defaultReachability, extraReachability = _requireOr('./reachability', {}) } = {}) {
    return async (next) => {
        reachability = { ...reachability, ...await extraReachability };
        const hostname = os.hostname();
        let requestCount = 0;
        const statuses = {};
        const reachabilityEntries = Object.entries(reachability);
        return async function monitor(context) {
            switch (context.url.pathname) {
                case '/monitor/status':
                    const downstream = {};
                    for (const [name, test] of reachabilityEntries) {
                        const meta = { status: 'failed', latency: 0, error: null };
                        const start = Date.now();
                        try {
                            await test(context, meta);
                            meta.status = 'healthy';
                        }
                        catch (err) {
                            meta.error = err;
                        }
                        finally {
                            meta.latency = Date.now() - start;
                        }
                        downstream[name] = meta;
                    }
                    return {
                        git,
                        uptime: process.uptime(),
                        service: serviceName,
                        hostname,
                        memory: process.memoryUsage(),
                        downstream,
                        stats: {
                            requestCount,
                            statuses
                        }
                    };
                default:
                    ++requestCount;
                    const result = await next(context);
                    const body = result || {};
                    statuses[body[STATUS]] = statuses[body[STATUS]] || 0;
                    ++statuses[body[STATUS]];
                    return result;
            }
        };
    };
}
// 
// - - - - - - - - - - - - - - - -
// Reachability Checks
// - - - - - - - - - - - - - - - -
// 
// 
// 
async function redisReachability(context, _) {
    await context.redisClient.ping();
}
// 

void ``;
const boltzmannVersion = `0.6.0`;
// 
const devErrorTemplateSource = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>
      {% if response.stack %}{{ response.name }}: {{ response.message }}{% elif
      renderError %}{{ renderError.name }}: {{ renderError.message }}{% else
      %}Error{% endif%}
    </title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/tachyons@4.12.0/css/tachyons.min.css"
    />
    <style>
      #stacktrace .copy-and-paste {
        display: none;
      }
      #stacktrace.paste .copy-and-paste {
        display: block;
      }
      #stacktrace.paste .rich {
        display: none;
      }
      .frame {
        cursor: pointer;
      }
      .frame .framecontext {
        display: none;
      }
      .frame.more .framecontext {
        display: table-row;
      }
      .lineno {
        user-select: none;
        width: 1%;
        min-width: 50px;
        text-align: right;
      }
      .framecontext {
        user-select: none;
      }
      .frameline {
        user-select: none;
      }
      .noselect {
        user-select: none;
      }
    </style>
  </head>

  <body class="sans-serif w-100">
    <header
      class="bg-{% if status >= 500 or not status %}light-red{% else %}purple{% endif %}"
    >
      <div class="mw7 center">
        <h1 class="f1-ns f4 mt0 mb2 white-90">
          {% if response.stack %} {% if status %}<code
            class="f3-ns bg-white normal br3 pv1 ph2 v-mid {% if status >= 500 %}red{% elif status >= 400 %}purple{% endif %}"
            >{{ status }}</code
          >
          {% endif %}{{ response.name }} at {{ context.url.pathname }} {% elif
          renderError %} {{ renderError.name }} at {{ context.url.pathname }} {%
          else %} Unknown error at {{ context.url.pathname }} {% endif %}
        </h1>
        <h2 class="f2-ns f5 mt0 mb2 white-80">
          {% if response.stack %} {{ response.message }} {% elif renderError %}
          {{ renderError.message }} {% endif %}
        </h2>

        <table class="f6 white">
          <tr>
            <td class="tr white-80 v-top pr2">Request Method</td>
            <td><code>{{ context.method }}</code></td>
          </tr>
          <tr>
            <td class="tr white-80 v-top pr2">Request URL</td>
            <td><code>{{ context.url }}</code></td>
          </tr>
          {% if context.handler.route %}
          <tr>
            <td class="tr white-80 v-top pr2">Handler</td>
            <td>
              <a
                class="link underline washed-blue dim"
                href="{{ context.handler.location }}"
                ><code>{{ context.handler.name }}</code></a
              >, mounted at
              <code
                >{{ context.handler.method }} {{ context.handler.route }}</code
              >
            </td>
          </tr>
          {% endif %}
          <tr>
            <td class="tr white-80 v-top pr2">Honeycomb Trace</td>
            <td>
              {% if context._honeycombTrace %}
              <a
                class="link underline washed-blue dim"
                target="_blank"
                rel="noreferrer noopener"
                href="{{ context.traceURL }}"
              >
                Available
              </a>
              {% else %}
              <details>
                <summary>Not available.</summary>
                Make sure the <code>HONEYCOMB_DATASET</code>,
                <code>HONEYCOMB_WRITEKEY</code>, and
                <code>HONEYCOMB_TEAM</code> environment variables are set,
                then restart boltzmann.
              </details>
              {% endif %}
            </td>
          </tr>
          <tr>
            <td class="tr white-80 v-top pr2">Handler Version</td>
            <td><code>{{ context.handler.version|default("*") }}</code></td>
          </tr>
          <tr>
            <td class="tr white-80 v-top pr2">Application Middleware</td>
            <td>
              <ol class="mv0 ph0" style="list-style-position: inside">
                {% for middleware in context._middleware %}
                <li>
                  <a
                    class="link underline washed-blue dim"
                    target="_blank"
                    rel="noopener noreferrer"
                    href="{{ middleware.location }}"
                    ><code>{{ middleware.name }}</code></a
                  >
                </li>
                {% else %}
                <li class="list">No application middleware installed.</li>
                {% endfor %}
              </ol>
            </td>
          </tr>
          <tr>
            <td class="tr white-80 v-top pr2">Handler Middleware</td>
            <td>
              {% if context.handler.middleware %}
              <ol class="mv0 ph0" style="list-style-position: inside">
                {% for middleware in context.handler.middleware %}
                <li><code>{{ middleware }}</code></li>
                {% else %}
                <li class="list">No handler-specific middleware installed.</li>
                {% endfor %}
              </ol>
              {% endif %}
            </td>
          </tr>
          <tr>
            <td class="tr white-80 v-top pr2">Template paths</td>
            <td>
              <ol class="mv0 ph0" style="list-style-position: inside">
                {% for path in template_paths %}
                <li><code>{{ path }}</code></li>
                {% endfor %}
              </ol>
            </td>
          </tr>
          <tr>
            <td class="tr white-80 v-top pr2">Boltzmann Version</td>
            <td>${boltzmannVersion}</td>
          </tr>
          <tr>
            <td class="tr white-80 v-top pr2">Node Version</td>
            <td>${process.versions.node}</td>
          </tr>
        </table>

        <aside class="pv3-l i f6 white-60 lh-copy">
          You&#39;re seeing this page because you are in dev mode. {% if
          context.method == "GET" %}
          <a class="link underline washed-blue dim" href="?__production=1"
            >Click here</a
          >
          to see the production version of this error, or {% endif %} set the
          <code>NODE_ENV</code> environment variable to
          <code>production</code> and restart the server.
        </aside>
      </div>
    </header>

    {% if response.__noMatch %}
    <section id="routes" class="bg-light-gray black-90">
      <div class="mw7 center pb3-l">
        <aside class="pv3-l i f6 black-60 lh-copy">
          The following routes are available:
        </aside>
        <table class="collapse w-100 frame">
          {% for name, handler in context._handlers %}
          <tr>
            <td>
              {% if handler.method.constructor.name == "Array" %} {% for method
              in handler.method %}
              <code>{{ method }}</code>{% if not loop.last %}, {% endif %} {%
              endfor %} {% else %}
              <code>{{ handler.method }}</code>
              {% endif %}
            </td>
            <td>
              <code>{{ handler.route }}</code>
            </td>
            <td>
              <code>{{ handler.name }}</code>
            </td>
          </tr>
          {% if handler.route == context.url.pathname %}
          <tr>
            <td><aside class="i f6 lh-copy black-40">↪︎</aside></td>
            <td colspan="2">
              <aside class="i f6 lh-copy black-40">
                Are you trying to access this route, which is available at a
                different method or version?
              </aside>
            </td>
          </tr>
          {% endif %} {% endfor %}
        </table>
      </div>
    </section>
    {% endif %}

    <section
      id="stacktrace"
      class="bg-washed-{% if status >= 500 or not status %}yellow{% else %}blue{% endif %} black-90"
    >
      <div class="mw7 center">
        {% if response.stack %}
        <div class="rich">
          <h3 class="f3-ns f5 mt0 pt2">
            Stack trace from error
            <button
              class="input-reset bn pointer"
              onclick="javascript:window.stacktrace.classList.toggle('paste');"
            >
              Switch to copy-and-paste view
            </button>
          </h3>
          {% if frames %} {% for frame in frames %}

          <p>
            <a
              href="vscode://file/{{ frame.getFileName() }}:{{ frame.getLineNumber() }}:{{ frame.getColumnNumber() }}"
              target="_blank"
              ><code>{{ frame.getRelativeFileName() }}</code></a
            >, line {{ frame.getLineNumber() }}, at
            <code>{{ frame.getFunctionNameSanitized() }}</code>
          </p>

          {% if frame.context %}
          <table
            class="collapse w-100 frame"
            onclick="javascript:this.closest('table').classList.toggle('more')"
          >
            {% for line in frame.context.pre %}
            <tr class="framecontext black-40 bg-black-10">
              <td class="lineno pr2 tr f7 black-20">
                <pre
                  class="ma0"
                ><code>{{ frame.getLineNumber() - loop.revindex }}</code></pre>
              </td>
              <td>
                <pre class="ma0"><code>{{ line }}</code></pre>
              </td>
            </tr>
            {% endfor %}
            <tr class="frameline black-90 bg-black-10">
              <td class="lineno pr2 tr f7 black-20">
                <pre class="ma0"><code>{{ frame.getLineNumber() }}</code></pre>
              </td>
              <td>
                <pre class="ma0"><code>{{ frame.context.line }}</code></pre>
              </td>
            </tr>
            <tr class="frameline black-90 bg-black-10">
              <td class="lineno pr2 tr f7 black-20">
                <pre class="ma0"><code></code></pre>
              </td>
              <td>
                <pre
                  class="ma0"
                ><code class="red">{{ "^"|indent(frame.getColumnNumber() - 1, true)|replace(" ", "-") }}</code></pre>
              </td>
            </tr>
            {% for line in frame.context.post %}
            <tr class="framecontext black-40 bg-black-10">
              <td class="lineno pr2 tr f7 black-20">
                <pre
                  class="ma0"
                ><code>{{ frame.getLineNumber() + loop.index }}</code></pre>
              </td>
              <td>
                <pre class="ma0"><code>{{ line }}</code></pre>
              </td>
            </tr>
            {% endfor %}
          </table>
          {% else %} {% endif %} {% endfor %} {% else %}
          <h1>
            <code>{{ response.name }}</code>:
            <code>{{ response.message }}</code>
          </h1>
          <pre><code>{{ response.stack }}</code></pre>
          <aside class="pv3-l i f6 white-60 lh-copy">
            The <code>.stack</code> property was accessed by other code before
            the template middleware received it. As a result, we cannot display
            a rich stack trace.
          </aside>
          {% endif %} {% endif %} {% if renderError %}
          <h3 class="f3-ns f5 mt0 pt2">
            Caught error rendering <code>{{ template }}</code>
          </h3>
          {% if "template not found" in renderError.message %}
          <aside class="pv3-l i f6 black-60 lh-copy">
            Caught <code>{{ renderError.message }}</code>. Tried the following
            paths:
          </aside>
          <ol class="mv0 ph0" style="list-style-position: inside">
            {% for path in template_paths %}
            <li><code>{{ path }}/{{ template }}</code></li>
            {% endfor %}
          </ol>
          {% else %}
          <pre><code>{{ renderError.stack }}</code></pre>
          {% endif %}
          <br />
          {% endif %}
        </div>

        <div class="copy-and-paste">
          <h3 class="f3-ns f5 mt0 pt2">
            Stack trace from error
            <button
              class="input-reset bn pointer"
              onclick="javascript:window.stacktrace.classList.toggle('paste');"
            >
              Switch back to interactive view
            </button>
          </h3>
          <textarea class="w-100 h5-l">
{{ response.stack }}{% if response.stack %}
{% endif %}{{ renderError.stack }}</textarea
          >
        </div>
      </div>
    </section>

    <section id="data" class="bg-light-gray black-90">
      <div class="mw7 center">
        <h3 class="f3-ns f5 mt0 pt2">Request Information</h3>
        {% if context.params %}
        <div class="flex flex-wrap">
          <h4 class="noselect mt0 tr w-10 mr2">URL Params</h4>
          <table class="collapse w-80 v-top">
            {% for name, value in context.params %}
            <tr>
              <td class="pb2 w-20 v-top tr pr4">
                <code class="black-60 i">{{ name }}</code>
              </td>
              <td class="pb2 v-top"><code>{{ value }}</code></td>
            </tr>
            {% endfor %}
          </table>
        </div>
        {% endif %}

        <div class="flex flex-wrap">
          <h4 class="noselect mt0 tr w-10 mr2">URL Query String</h4>
          <table class="collapse w-80 v-top">
            {% for name, value in context.query %}
            <tr class="striped--light-gray">
              <td class="pb2 w-20 v-top tr pr4">
                <code class="black-60 i">{{ name }}</code>
              </td>
              <td class="pb2 v-top"><code>{{ value }}</code></td>
            </tr>
            {% endfor %}
          </table>
        </div>

        <div class="flex flex-wrap">
          <h4 class="noselect mt0 tr w-10 mr2">Request Headers</h4>
          <table class="collapse w-80">
            {% for name, value in context.headers %}
            <tr class="striped--light-gray">
              <td class="pb2 w-20 v-top tr pr4">
                <code class="black-60 i">{{ name }}:</code>
              </td>
              <td class="pb2 v-top"><code>{{ value }}</code></td>
            </tr>
            {% endfor %}
          </table>
        </div>

        <hr />

        <h3 class="f3-ns f5 mt0 pt2">Response Information</h3>
        <aside class="pb3-l i f6 black-60 lh-copy">
          Response was{% if not threw %} not{% endif %} thrown.
        </aside>
        <div class="flex flex-wrap">
          <h4 class="noselect mt0 tr w-10 mr2">Status</h4>
          <pre
            class="mt0"
          ><a href="https://httpstatus.es/{{ status }}"><code>{{ status }}</code></a></pre>
        </div>

        {% if template %}
        <div class="flex flex-wrap">
          <h4 class="noselect mt0 tr w-10 mr2">Template</h4>
          <pre class="mt0"><code>{{ template }}</code></pre>
        </div>
        {% endif %}

        <div class="flex flex-wrap">
          <h4 class="noselect mt0 tr w-10 mr2">Response Data</h4>
          <pre class="mt0"><code>{{ response|dump(2) }}</code></pre>
        </div>

        <div class="flex flex-wrap">
          <h4 class="noselect mt0 tr w-10 mr2">Response Headers</h4>
          <pre class="mt0"><code>{{ headers|dump(2) }}</code></pre>
        </div>
      </div>
    </section>
  </body>
</html>
`;
// 
function template({ paths = ['templates'], filters = {}, tags = {}, logger = bole('boltzmann:templates'), opts = {
    noCache: isDev()
} } = {}) {
    const nunjucks = require('nunjucks');
    paths = [].concat(paths);
    try {
        const assert = require('assert');
        paths.forEach(xs => assert(typeof xs == 'string'));
    }
    catch (_c) {
        throw new TypeError('The `paths` option for template() must be an array of path strings');
    }
    paths = paths.slice().map(xs => path.resolve(__dirname, xs));
    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(paths, {}), opts);
    for (const name in filters) {
        env.addFilter(name, (...args) => {
            const cb = args[args.length - 1];
            new Promise((resolve, _) => {
                resolve(filters[name](...args.slice(0, -1)));
            }).then(xs => cb(null, xs), xs => cb(xs, null));
        }, true);
    }
    for (const name in tags) {
        env.addExtension(name, tags[name]);
    }
    const devErrorTemplate = new nunjucks.Template(devErrorTemplateSource, env);
    // development behavior: if we encounter an error rendering a template, we
    // display a development error template explaining the error. If the error
    // was received while handling an original error, that will be displayed as
    // well. TODO: each stack frame should be displayed in context.
    //
    // production behavior: we try to render a 5xx.html template. If that's not
    // available, return a "raw" error display -- "An error occurred" with a
    // correlation ID.
    return (next) => {
        return async function template(context) {
            const response = await next(context);
            let { [STATUS]: status, [HEADERS]: headers, [TEMPLATE]: template, [THREW]: threw } = response;
            if (!template && !threw) {
                return response;
            }
            let ctxt = response;
            let name = template;
            let renderingErrorTemplate = false;
            if (threw && !template) {
                // If you threw and didn't have a template set, we have to guess at
                // whether this response is meant for consumption by a browser or
                // some other client.
                const maybeJSON = (context.headers['sec-fetch-dest'] === 'none' || // fetch()
                    'x-requested-with' in context.headers ||
                    (context.headers['content-type'] || '').includes('application/json'));
                if (maybeJSON) {
                    return response;
                }
                headers['content-type'] = 'text/html';
                const useDebug = isDev() && !('__production' in context.query);
                name = (useDebug
                    ? devErrorTemplate
                    : `${String(status - (status % 100)).replace(/0/g, 'x')}.html`);
                renderingErrorTemplate = true;
                let frames;
                if (useDebug) {
                    const stackman = require('stackman')();
                    frames = await new Promise((resolve, _) => {
                        stackman.callsites(response, (err, frames) => err ? resolve([]) : resolve(frames));
                    });
                    const contexts = await new Promise((resolve, _) => {
                        stackman.sourceContexts(frames, (err, contexts) => err ? resolve([]) : resolve(contexts));
                    });
                    frames.forEach((frame, idx) => frame.context = contexts[idx]);
                }
                ctxt = {
                    context,
                    response,
                    frames,
                    template,
                    template_paths: paths,
                    renderError: null,
                    headers,
                    threw,
                    status
                };
            }
            let rendered;
            try {
                rendered = await new Promise((resolve, reject) => {
                    env.render(name, ctxt, (err, result) => {
                        err ? reject(err) : resolve(result);
                    });
                });
            }
            catch (err) {
                status = err[STATUS] || 500;
                const target = !renderingErrorTemplate && isDev() ? devErrorTemplate : '5xx.html';
                rendered = await new Promise((resolve, _) => {
                    env.render(target, {
                        context,
                        response,
                        template: name,
                        template_paths: paths,
                        renderError: err,
                        headers,
                        status
                    }, (err, result) => {
                        if (err) {
                            const correlation = require('uuid').v4();
                            if (response.stack) {
                                logger.error(`[${correlation} 1/2] Caught error rendering 5xx.html for original error: ${response.stack}`);
                            }
                            logger.error(`[${correlation} ${response.stack ? '2/2' : '1/1'}] Caught template error while rendering 5xx.html: ${err.stack}`);
                            resolve(`
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <meta charset="UTF-8">
                <title></title>
              </head>
              <body>
                <h1>An unexpected server error occurred (ref: <code>${correlation}</code>).</h1>
              </body>
              </html>`);
                        }
                        else {
                            resolve(result);
                        }
                    });
                });
            }
            // NB: This removes "THREW" because the template layer is handling the error.
            return Object.assign(Buffer.from(rendered, 'utf8'), {
                [STATUS]: status,
                [HEADERS]: headers,
            });
        };
    };
}
void ``;

void ``;
let savepointId = 0;
function test({ middleware = Promise.resolve([]), handlers = _requireOr('./handlers', {}), bodyParsers = _requireOr('./body', [urlEncoded, json]), after = require('tap').teardown, }) {
    // 
    // 
    const redisClient = redis.createNodeRedisClient(`redis://localhost:6379/7`);
    middleware = Promise.resolve(middleware).then((mw) => {
        mw.push(() => (next) => async (context) => {
            context._redisClient = redisClient;
            return next(context);
        });
        return mw;
    });
    // 
    // 
    after(() => {
        // 
        // 
        redisClient.quit();
        // 
    });
    // 
    const { inject } = require('@hapi/shot');
    return (inner) => {
        return async (outerAssert) => {
            const assert = outerAssert;
            const [resolvedHandlers, resolvedBodyParsers, resolvedMiddleware] = await Promise.all([
                handlers,
                bodyParsers,
                middleware,
            ]);
            // 
            // 
            await redisClient.flushdb();
            resolvedMiddleware.unshift(() => (next) => async (context) => {
                context._redisClient = redisClient;
                return next(context);
            });
            assert.redisClient = redisClient;
            // 
            const server = await runserver({
                middleware: resolvedMiddleware,
                bodyParsers: resolvedBodyParsers,
                handlers: resolvedHandlers,
            });
            const [onrequest] = server.listeners('request');
            const request = async ({ method = 'GET', url = '/', headers = {}, body, payload, ...opts } = {}) => {
                headers = headers || {};
                payload = payload || body;
                if (!Buffer.isBuffer(payload) && typeof payload !== 'string' && payload) {
                    payload = JSON.stringify(payload);
                    headers['content-type'] = 'application/json';
                }
                const response = await inject(onrequest, {
                    method,
                    url,
                    headers,
                    payload,
                    ...opts,
                });
                Object.defineProperty(response, 'json', {
                    get() {
                        return JSON.parse(this.payload);
                    },
                });
                return response;
            };
            assert.request = request;
            try {
                await inner(assert);
            }
            finally {
                // 
            }
        };
    };
}

void ``;
function vary(on = []) {
    const headers = [].concat(on);
    return (next) => {
        return async (context) => {
            const response = await next(context);
            response[HEADERS].vary = [].concat(response[HEADERS].vary || [], headers);
            return response;
        };
    };
}
void ``;

void ``;
const addAJVFormats = (validator) => (require('ajv-formats')(validator), validator);
const addAJVKeywords = (validator) => (require('ajv-keywords')(validator), validator);
function validateBody(schema, { ajv: validator = addAJVFormats(addAJVKeywords(new Ajv({
    useDefaults: true,
    allErrors: true,
    strictTypes: isDev() ? true : "log",
}))), } = {}) {
    const compiled = validator.compile(schema && schema.isFluentSchema ? schema.valueOf() : schema);
    return function validate(next) {
        return async (context) => {
            const subject = await context.body;
            const valid = compiled(subject);
            if (!valid) {
                const newBody = Promise.reject(Object.assign(new Error('Bad request'), { errors: compiled.errors, [STATUS]: 400 }));
                newBody.catch(() => { });
                context.body = newBody;
            }
            else {
                context.body = Promise.resolve(subject);
            }
            return next(context);
        };
    };
}
function validateBlock(what) {
    return function validate(schema, { ajv: validator = addAJVFormats(addAJVKeywords(new Ajv({
        useDefaults: true,
        allErrors: true,
        coerceTypes: 'array',
        strictTypes: isDev() ? true : "log",
    }))), } = {}) {
        const compiled = validator.compile(schema && schema.isFluentSchema ? schema.valueOf() : schema);
        return function validate(next) {
            return async (context) => {
                const subject = what(context);
                const valid = compiled(subject);
                if (!valid) {
                    return Object.assign(new Error('Bad request'), {
                        [THREW]: true,
                        [STATUS]: 400,
                        errors: compiled.errors
                    });
                }
                return next(context);
            };
        };
    };
}
const validateQuery = validateBlock(ctx => ctx.query);
const validateParams = validateBlock(ctx => ctx.params);
const validate = {
    /**{% changelog(version="0.0.0") %}
 * 
 * * **Changed in 0.1.7:** Bugfix to support validator use as middleware.
 * * **Changed in 0.2.0:** Added support for schemas defined via [`fluent-json-schema`]( "https://www.npmjs.com/package/fluent-json-schema").
 * * **Changed in 0.5.0:** Added second options argument, accepting [`ajv`]( "https://ajv.js.org/").
 *   {% end %}
 * 
 * The `validate.body` middleware applies [JSON schema]( "https://json-schema.org/") validation to incoming
 * request bodies. It intercepts the body that would be returned by
 * \[`context.body`] and validates it against the given schema, throwing a `400 Bad Request` error on validation failure. If the body passes validation it is
 * passed through.
 * 
 * `Ajv` is configured with `{useDefaults: true, allErrors: true}` by default. In
 * development mode, `strictTypes` is set to `true`. In non-development mode,
 * it is set to `"log"`.
 * 
 * **Arguments:**
 * 
 * `validate.body(schema[, { ajv }])`
 * 
 * * `schema`: Positional. A [JSON schema]( "https://json-schema.org/") object defining valid input.
 * * `options`: Positional.
 *   * `ajv`: Named. Optionally provide a custom instance of [`ajv`]( "https://ajv.js.org/").
 * 
 * **Example Usage:**
 * 
 * ````js
 * // handlers.js
 * const { middleware } = require('boltzmann')
 * 
 * example.middleware = [
 *   [middleware.validate.body, {
 *     type: 'object',
 *     required: ['id'],
 *     properties: {
 *       id: { type: 'string', format: 'uuid' }
 *     }
 *   }]
 * ]
 * example.route = 'POST /example'
 * export async function example (context) {
 *   // if body.id isn't a uuid, this throws a 400 Bad request error,
 *   // otherwise `id` is a string containing a uuid:
 *   const { id } = await context.body
 * }
 * 
 * const Ajv = require('ajv')
 * customAjv.middleware = [
 *   [middleware.validate.body, {
 *     type: 'object',
 *     required: ['id'],
 *     properties: {
 *       id: { type: 'string', format: 'uuid' }
 *     }
 *   }, {
 *     // You can customize Ajv behavior by providing your own Ajv
 *     // instance, like so:
 *     ajv: new Ajv({
 *       coerceTypes: true
 *     })
 *   }]
 * ]
 * customAjv.route = 'POST /custom'
 * export async function customAjv (context) {
 *   // if body.id isn't a uuid, this throws a 400 Bad request error,
 *   // otherwise `id` is a string containing a uuid:
 *   const { id } = await context.body
 * }
 * ````
 * 
 * ---
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/03-middleware#validate-body")*/
    body: validateBody,
    /**{% changelog(version="0.0.0") %}
 * 
 * * **Changed in 0.1.7:** Bugfix to support validator use as middleware.
 * * **Changed in 0.2.0:** Added support for schemas defined via [`fluent-json-schema`]( "https://www.npmjs.com/package/fluent-json-schema").
 * * **Changed in 0.5.0:** Added second options argument, accepting `ajv`.
 *   {% end %}
 * 
 * The `validate.query` middleware applies [JSON schema]( "https://json-schema.org/") validation to incoming
 * HTTP query (or "search") parameters. Query parameters are validated against the
 * given schema, throwing a `400 Bad Request` error on validation failure,
 * preventing execution of the handler. If the query parameters pass validation the
 * handler is called.
 * 
 * `Ajv` is configured with `{allErrors: true, useDefaults: true, coerceTypes: "array"}` by default. In development mode, `strictTypes` is set to `true`.
 * In non-development mode, it is set to `"log"`.
 * 
 * **Arguments:**
 * 
 * `validate.query(schema[, { ajv }])`
 * 
 * * `schema`: Positional. A [JSON schema]( "https://json-schema.org/") object defining valid input.
 * * `options`: Positional.
 *   * `ajv`: Named. Optionally provide a custom instance of [`ajv`]( "https://ajv.js.org/").
 * 
 * **Example Usage:**
 * 
 * ````js
 * // handlers.js
 * const { middleware } = require('boltzmann')
 * 
 * example.middleware = [
 *   [middleware.validate.query, {
 *     type: 'object',
 *     required: ['id'],
 *     properties: {
 *       id: { type: 'string', format: 'uuid' }
 *     }
 *   }]
 * ]
 * example.route = 'GET /example'
 * export async function example (context) {
 *   const { id } = context.query
 * }
 * 
 * const Ajv = require('ajv')
 * customAjv.middleware = [
 *   [middleware.validate.query, {
 *     type: 'object',
 *     required: ['id'],
 *     properties: {
 *       id: { type: 'string', format: 'uuid' }
 *     }
 *   }, {
 *     // You can customize Ajv behavior by providing your own Ajv
 *     // instance, like so:
 *     ajv: new Ajv({
 *       coerceTypes: true
 *     })
 *   }]
 * ]
 * customAjv.route = 'GET /custom'
 * export async function customAjv (context) {
 *   const { id } = context.query
 * }
 * ````
 * 
 * ---
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/03-middleware#validate-query")*/
    query: validateQuery,
    /**{% changelog(version="0.0.0") %}
 * 
 * * **Changed in 0.1.7:** Bugfix to support validator use as middleware.
 * * **Changed in 0.2.0:** Added support for schemas defined via [`fluent-json-schema`]( "https://www.npmjs.com/package/fluent-json-schema").
 * * **Changed in 0.5.0:** Added second options argument, accepting `ajv`.
 *   {% end %}
 * 
 * The `validate.params` middleware applies [JSON schema]( "https://json-schema.org/") validation to url
 * parameters matched during request routing. Matched URL parameters are validated
 * against the given schema, throwing a `400 Bad Request` error on validation
 * failure, preventing execution of the handler. If the parameters pass validation
 * the handler is called.
 * 
 * `Ajv` is configured with `{allErrors: true, useDefaults: true, coerceTypes: "array"}` by default. In development mode, `strictTypes` is set to `true`.
 * In non-development mode, it is set to `"log"`.
 * 
 * **Arguments:**
 * 
 * `validate.params(schema[, { ajv }])`
 * 
 * * `schema`: Positional. A [JSON schema]( "https://json-schema.org/") object defining valid input.
 * * `options`: Positional.
 *   * `ajv`: Named. Optionally provide a custom instance of [`ajv`]( "https://ajv.js.org/").
 * 
 * **Example Usage:**
 * 
 * ````js
 * // handlers.js
 * const { middleware } = require('boltzmann')
 * 
 * example.middleware = [
 *   [middleware.validate.params, {
 *     type: 'object',
 *     required: ['id'],
 *     properties: {
 *       id: { type: 'string', format: 'uuid' }
 *     }
 *   }]
 * ]
 * example.route = 'GET /example/:id'
 * export async function example (context) {
 *   const { id } = context.params
 * }
 * 
 * const Ajv = require('ajv')
 * customAjv.middleware = [
 *   [middleware.validate.params, {
 *     type: 'object',
 *     required: ['id'],
 *     properties: {
 *       id: { type: 'string', format: 'uuid' }
 *     }
 *   }, {
 *     // You can customize Ajv behavior by providing your own Ajv
 *     // instance, like so:
 *     ajv: new Ajv({
 *       coerceTypes: true
 *     })
 *   }]
 * ]
 * customAjv.route = 'GET /:id'
 * export async function customAjv (context) {
 *   const { id } = context.params
 * }
 * ````
 * 
 * ---
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/03-middleware#validate-params")*/
    params: validateParams
};
void ``;
void ``;



void ``;
async function _collect(request) {
    const acc = [];
    for await (const chunk of request) {
        acc.push(chunk);
    }
    return Buffer.concat(acc);
}
function _processMiddleware(middleware) {
    if (Array.isArray(middleware)) {
        return middleware;
    }
    else {
        return middleware.APP_MIDDLEWARE;
    }
}
function _processBodyParsers(parsers) {
    if (Array.isArray(parsers)) {
        return parsers;
    }
    else {
        return parsers.APP_BODY_PARSERS;
    }
}
async function _requireOr(target, value) {
    try {
        return require(target);
    }
    catch (err) {
        if (err.code === 'MODULE_NOT_FOUND' && err.requireStack && err.requireStack[0] === __filename) {
            return value;
        }
        throw err;
    }
}
void ``;

void ``;
const body = {
    json,
    urlEncoded,
    urlencoded: urlEncoded,
};
const decorators = {
    validate,
    test,
};
const middleware = {
    /**This middleware is always attached to Boltzmann apps.
 * 
 * This middleware configures the [bole]( "https://github.com/rvagg/bole") logger and enables per-request
 * logging. In development mode, the logger is configured using
 * [bistre]( "https://github.com/hughsk/bistre") pretty-printing. In production mode, the output is
 * newline-delimited json.
 * 
 * To configure the log level, set the environment variable `LOG_LEVEL` to a level that bole supports.
 * The default level is `debug`. To tag your logs with a specific name, set the environment variable
 * `SERVICE_NAME`. The default name is `boltzmann`.
 * 
 * Here is an example of the request logging:
 * 
 * ````shell
 * > env SERVICE_NAME=hello NODE_ENV=production ./boltzmann.js
 * {"time":"2020-11-16T23:28:58.104Z","hostname":"catnip.local","pid":19186,"level":"info","name":"server","message":"now listening on port 5000"}
 * {"time":"2020-11-16T23:29:02.375Z","hostname":"catnip.local","pid":19186,"level":"info","name":"hello","message":"200 GET /hello/world","id":"GSV Total Internal Reflection","ip":"::1","host":"localhost","method":"GET","url":"/hello/world","elapsed":1,"status":200,"userAgent":"HTTPie/2.3.0"}
 * ````
 * 
 * The `id` fields in logs is the value of the request-id, available on the context object as the `id`
 * field. This is set by examining headers for an existing id. Boltzmann consults `x-honeycomb-trace`,
 * `x-request-id` and `traceparent` before falling back to generating a request id using a short
 * randomly-selected string.
 * 
 * To log from your handlers, you might write code like this:
 * 
 * ````js
 * const logger = require('bole')('handlers')
 * 
 * async function greeting(/** @type {Context} *\/ context) {
 *     logger.info(`extending a hearty welcome to ${context.params.name}`)
 *     return `hello ${context.params.name}`
 * }
 * ````
 * 
 * ---
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/03-middleware#log")*/
    log,
    /**{{ changelog(version="0.5.0") }}
 * 
 * The `vary` middleware unconditionally updates responses to include a [`Vary`]( "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Vary")
 * header with the configured values. This is useful for handlers that change
 * behavior based on `context.cookie`. It is automatically installed for handlers
 * that use the [`.version` attribute]( "@/reference/02-handlers.md#version").
 * 
 * **Arguments:**
 * 
 * * `on`: A string or list of strings, representing `Vary` values.
 * 
 * **Example Usage:**
 * 
 * ````js
 * // handlers.js
 * const { middleware } = require('./boltzmann.js')
 * cookies.middleware = [
 *   [middleware.vary, 'cookie']
 * ]
 * cookies.route = 'GET /'
 * export function cookies(context) {
 *   return context.cookie.get('wow') ? 'great' : 'not great'
 * }
 * 
 * // multiple values may be set at once.
 * multi.middleware = [
 *   [middleware.vary, ['cookie', 'accept-encoding']]
 * ]
 * multi.route = 'GET /multi'
 * export function multi(context) {
 *   return context.cookie.get('wow') ? 'great' : 'not great'
 * }
 * ````
 * 
 * ---
 * 
 * ## Automatically attached middlewareAutomatically-attached middleware is middleware you can configure but do *not* need to attach to
 * the app yourself. Boltzmann automatically attaches these middlewares if the features that provide
 * them are enabled. You can often configure this middleware, however, using environment variables.
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/03-middleware#vary")*/
    vary,
    // 
    /**{{ changelog(version = "0.5.0") }}
 * 
 * [To be documented.]( "#TKTKTK")
 * 
 * ---
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/03-middleware#route")*/
    route,
    // 
    // 
    // 
    // 
    // 
    /**The `template` middleware is available if you have enabled the templating feature with
 * `--templates=on`.  It enables returning rendered [nunjucks]( "https://mozilla.github.io/nunjucks/")
 * templates from handlers. See the [website features overview]( "@/concepts/03-websites.md") for a
 * description of how to use templates to build websites and the development conveniences provided.
 * 
 * **Arguments:**
 * 
 * * `paths`: an array of string paths where template files are looked up; defaults to `./templates`, a
 *   single directory relative to the application root.
 * * `filters`: an object specifying [custom
 *   filters]( "https://mozilla.github.io/nunjucks/api#custom-filters") to add to the Nunjucks renderer.
 *   Object keys are filter names, and the values must be filter functions. Boltzmann enhances the default
 *   nunjucks behavior here, and allows you to register async functions as filters.
 * * `tags`: [custom tags]( "https://mozilla.github.io/nunjucks/api#custom-tags") that extend the nunjucks
 *   renderer. Object keys are tag/extention names, and the values are the extention implementations.
 * * `logger`: ; defaults to `bole('boltzmann:templates')`
 * * `opts`: a [configuration object]( "https://mozilla.github.io/nunjucks/api.html#configure") passed to
 *   nunjucks. Defaults to the single setting `noCache`, which is set to true if the app is run in
 *   development mode, to support caching in production but live reloading in development.
 * 
 * ---
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/03-middleware#template")*/
    template,
    /**The `template` middleware is available if you have enabled the templating feature with
 * `--templates=on`. It allows you to add extra data to every context value sent to template
 * rendering.
 * 
 * **Arguments:**
 * 
 * * `extraContext`: An object specifying key/value pairs to add to the context. The keys are the name of the context value. The value can either be a static value or an optionally asynchronous function returning a value.
 * 
 * **Example Usage:**
 * 
 * ````javascript
 * const boltzmann = require('./boltzmann')
 * async function fetchActiveUsers(context) {
 *   // do something with i/o here
 * }
 * 
 * module.exports = {
 *   APP_MIDDLEWARE: [
 *     [
 *       boltzmann.middleware.applyCSRF,
 *       [ boltzmann.middleware.templateContext, {
 *         siteTitle: 'Boltzmann User Conference',
 *         activeUsers: fetchActiveUsers
 *       } ],
 *       boltzmann.middleware.template,
 *     ],
 *   ],
 * }
 * ````
 * 
 * ---
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/03-middleware#templatecontext")*/
    templateContext,
    // 
    /**[To be documented.]( "https://github.com/entropic-dev/boltzmann/issues/68")
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/03-middleware#applyheaders")*/
    applyHeaders,
    applyXFO,
    /**The `handleCORS` middleware is always available to be attached. It configures headers to
 * control [Cross-Origin Resource Sharing]( "https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS"), or CORS.
 * 
 * **Arguments:**
 * 
 * * `origins`: the origins that are permitted to request resources; sent in responses inn the
 *   `Access-Control-Allow-Origin` header value
 * * `methods`: the allowed HTTP verbs; sent in responses in the `Access-Control-Allow-Methods` header
 *   value
 * * `headers`: the custom headers the server will allow; sent in in responses in the
 *   `Access-Control-Allow-Headers` header value
 * 
 * **Example Usage:**
 * 
 * ````javascript
 * const boltzmann = require('./boltzmann')
 * const isDev = require('are-we-dev')
 * 
 * module.exports = {
 *   APP_MIDDLEWARE: [
 *     [ boltzmann.middleware.handleCORS, {
 *       origins: isDev() ? '*' : [ 'www.example.com', 'another.example.com' ],
 *       methods: [ 'GET', 'POST', 'PATCH', 'PUT', 'DELETE' ],
 *       headers: [ 'Origin', 'Content-Type', 'Accept', 'Accept-Version', 'x-my-custom-header' ],
 *     } ],
 *   ],
 * }
 * ````
 * 
 * ---
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/03-middleware#handlecors")*/
    handleCORS,
    /**{{ changelog(version = "0.1.4") }}
 * 
 * You can import session middleware with `require('./boltzmann').middleware.session`. The session
 * middleware provides [HTTP session support]( "https://en.wikipedia.org/wiki/Session_(computer_science)#HTTP_session_token") using sealed http-only [cookies]( "https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies"). You can read more about
 * Boltzmann's session support in the ["storage" chapter]( "#TKTKTK").
 * 
 * **Arguments:**
 * 
 * * `secret`: **Required**. A 32-character string (or buffer) used to seal the client session id. Read
 *   from `process.env.SESSION_SECRET`.
 * * `salt`: **Required**. A string or buffer used to salt the client session id before hashing it for lookup.
 *   Read from `process.env.SESSION_SALT`.
 * * `load`: An async function taking `context` and an encoded `id` and returning a plain JavaScript object.
 *   Automatically provided if the [`--redis`]( "@/reference/01-cli.md#redis") feature is enabled, otherwise **required**. Examples below.
 * * `save`: An async function taking `context`, an encoded `id`, and a plain JavaScript object for storage.
 *   Automatically provided if the [`--redis`]( "@/reference/01-cli.md#redis") feature is enabled, otherwise **required**. Examples below.
 * * `cookie`: The name of the cookie to read the client session id from. Read from `process.env.SESSION_ID`.
 * * `iron`: Extra options for [`@hapi/iron`]( "https://github.com/hapijs/iron"), which is used to seal the client session id for transport in
 *   a cookie.
 * * `expirySeconds`: The number of seconds until the cookie expires. Defaults to one year.
 * * `cookieOptions`: An object containing options passed to the [`cookie`]( "https://www.npmjs.com/package/cookie#options-1") package when serializing a session id.
 * 
 * **Example Usage:**
 * 
 * ````javascript
 * const { middleware } = require('./boltzmann')
 * 
 * // The most basic configuration. Relies on environment variables being set for required values.
 * // Consider using this!
 * module.exports = {
 *   APP_MIDDLEWARE: [
 *     middleware.session
 *   ]
 * };
 * 
 * // A simple configuration, hard-coding the values. Don't actually do this.
 * module.exports = {
 *   APP_MIDDLEWARE: [
 *     [middleware.session, { secret: 'wow a great secret, just amazing'.repeat(2), salt: 'salty' }],
 *   ]
 * };
 * 
 * // A complicated example, where you store sessions on the filesystem, because
 * // the filesystem is a database.
 * const fs = require('fs').promise
 * module.exports = {
 *   APP_MIDDLEWARE: [
 *     [middleware.session, {
 *       async save (_context, id, data) {
 *         // We receive "_context" in case there are any clients we wish to use
 *         // to save or load our data. In this case, we're using the filesystem,
 *         // so we can ignore the context.
 *         return await fs.writeFile(id, 'utf8', JSON.stringify(id))
 *       },
 *       async load (_context, id) {
 *         return JSON.parse(await fs.readFile(id, 'utf8'))
 *       }
 *     }]
 *   ]
 * }
 * 
 * module.exports = {
 *   // A configuration that sets "same-site" to "lax", suitable for sites that require cookies
 *   // to be sent when redirecting from an external site. E.g., sites that use OAuth-style login
 *   // flows.
 *   APP_MIDDLEWARE: [
 *     [middleware.session, { cookieOptions: { sameSite: 'lax' } }],
 *   ]
 * };
 * ````
 * 
 * ---
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/03-middleware#session")*/
    session,
    // 
    /**[Docs]("https://www.boltzmann.dev/en/latest/docs/reference/03-middleware#applycsrf")*/
    applyCSRF,
    // 
    /**[To be documented]( "#TKTKTK")
 * 
 * ---
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/03-middleware#test")*/
    test,
    validate,
};
module.exports = {...module.exports,  Context, main: runserver, middleware, body, decorators, routes, printRoutes, };
// 




  void ``;
/* c8 ignore next */
if (require.main === module && !process.env.TAP) {
    // 
    honeycomb.start().then(run);
    function run() {
        // 
        runserver({
            middleware: _requireOr('./middleware', [])
                .then(_processMiddleware)
                .then((mw) => {
                // 
                // 
                const acc = [];
                // 
                acc.push(handlePing);
                // 
                // 
                acc.push(trace);
                // 
                // 
                acc.push(log);
                // 
                acc.push(attachRedis);
                // 
                // 
                acc.push(...mw);
                // 
                acc.push(handleStatus);
                // 
                return acc.filter(Boolean);
            }),
        })
            .then((server) => {
            server.listen(Number(process.env.PORT) || 8000, () => {
                const addrinfo = server.address();
                if (!addrinfo) {
                    return;
                }
                bole('boltzmann:server').info(`now listening on port ${typeof addrinfo == 'string' ? addrinfo : addrinfo.port}`);
            });
        })
            .catch((err) => {
            console.error(err.stack);
            process.exit(1);
        });
        // 
    }
    // 
}


