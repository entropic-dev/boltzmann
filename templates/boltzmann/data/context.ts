void `{% if selftest %}`;
import { honeycomb } from '../core/prelude'
import { otel } from '../core/honeycomb'
import { IncomingMessage, ServerResponse } from 'http'
import { Accepts } from 'accepts'
import accepts from 'accepts'
import * as uuid from 'uuid'
import { URL } from 'url'

// More imports below. (Rule is: local imports must follow exports.)
void `{% endif %}`;

interface GetSession {
  (): Promise<Session>
}

class Context {
  private _accepts?: Accepts
  private _query?: Record<string, any>
  private _parsedUrl?: URL
  private _body?: Promise<Record<string, any>>
  private _cookie?: Cookie
  public _loadSession: GetSession

  /**{{- tsdoc(page="02-handlers.md", section="id") -}}*/
  public id: string

  /**{{- tsdoc(page="02-handlers.md", section="start") -}}*/
  public start: number

  /**{{- tsdoc(page="02-handlers.md", section="remote") -}}*/
  public remote: string

  /**{{- tsdoc(page="02-handlers.md", section="host") -}}*/
  public host: string

  /**{{- tsdoc(page="02-handlers.md", section="params") -}}*/
  public params: Record<string, any>

  /**{{- tsdoc(page="02-handlers.md", section="handler") -}}*/
  public handler: Handler = Context.baseHandler

  // {% if redis %}
  public _redisClient?: WrappedNodeRedisClient
  // {% endif %}
  // {% if postgres %}
  public _postgresPool?: PGPool
  public _postgresConnection?: Promise<PGClient>
  // {% endif %}

  // {% if honeycomb %}
  /**{{- tsdoc(page="02-handlers.md", section="span") -}}*/
  public span: otel.Span | null
  // {% endif %}

  ;[extensions: string]: any

  constructor(public request: IncomingMessage, public _response: ServerResponse) {
    this.request = request
    this.start = Date.now()
    this.remote = request.socket
      ? (request.socket.remoteAddress || '').replace('::ffff:', '')
      : ''
    const [host,] = (request.headers['host'] || '').split(':')
    this.host = host
    this.params = {}

    this.id = String(
      request.headers['x-honeycomb-trace'] ||
      request.headers['x-request-id'] ||
      request.headers['traceparent'] ||
      uuid.v4()
    )
    this._loadSession = async () => {
      throw new Error('To use context.session, attach session middleware to your app')
    }
    void `{% if honeycomb %}`
    this.span = null
    void `{% endif %}`
  }

  static baseHandler (context: Context): Promise<any> {
    throw new NoMatchError(String(context.request.method), context.url.pathname)
  }

  // {% if postgres %}
  /**{{- tsdoc(page="02-handlers.md", section="postgresclient") -}}*/
  get postgresClient (): Promise<PGClient> {
    if (this._postgresConnection) {
      return this._postgresConnection
    }

    if (!this._postgresPool) {
      throw new Error('Cannot fetch postgresClient before a pool is assigned (middleware should do this.)')
    }

    this._postgresConnection = <Promise<PGClient>><unknown>this._postgresPool.connect()
    return this._postgresConnection
  }
  // {% endif %}

  get hasCookie () {
    return Boolean(this._cookie)
  }

  /**{{- tsdoc(page="02-handlers.md", section="cookie") -}}*/
  get cookie () {
    this._cookie = this._cookie || Cookie.from(this.headers.cookie || '')
    return this._cookie
  }

  /**{{- tsdoc(page="02-handlers.md", section="session") -}}*/
  get session (): Promise<Session> {
    return this._loadSession()
  }

  // {% if redis %}
  /**{{- tsdoc(page="02-handlers.md", section="redisClient") -}}*/
  get redisClient (): WrappedNodeRedisClient {
    if (!this._redisClient) {
      throw new Error('No redis client available')
    }
    return this._redisClient
  }
  // {% endif %}

  /**{{- tsdoc(page="02-handlers.md", section="method") -}}*/
  get method(): string {
    return <string>this.request.method
  }

  /**{{- tsdoc(page="02-handlers.md", section="headers") -}}*/
  get headers(): Record<string, any> {
    return this.request.headers
  }

  // {% if honeycomb %}
  /**{{- tsdoc(page="02-handlers.md", section="traceURL") -}}*/
  get traceURL () {
    const url = new URL(`https://ui.honeycomb.io/${process.env.HONEYCOMB_TEAM}/datasets/${process.env.HONEYCOMB_DATASET}/trace`)
    if (honeycomb.features.beeline) {
      url.searchParams.set('trace_id', this._honeycombTrace.payload['trace.trace_id'])
      url.searchParams.set('trace_start_ts', String(Math.floor(this._honeycombTrace.startTime/1000 - 1)))
    } else if (honeycomb.features.otel) {
      const spanCtx = this._honeycombTrace.spanContext()
      const [startSeconds, startNanos] = this._honeycombTrace.startTime
      url.searchParams.set('trace_id', spanCtx.traceId)

      url.searchParams.set(
        'trace_start_ts',
        String(startSeconds * 1000 + startNanos / 1000)
      )
    }
    return String(url)
  }
  // {% endif %}

  /**{{- tsdoc(page="02-handlers.md", section="url") -}}*/
  get url() {
    if (this._parsedUrl) {
      return this._parsedUrl
    }
    this._parsedUrl = new URL(String(this.request.url), `http://${this.headers.host || 'example.com'}`)
    return this._parsedUrl
  }

  /**{{- tsdoc(page="02-handlers.md", section="url") -}}*/
  set url(value) {
    this._query = undefined
    if (value instanceof URL) {
      this._parsedUrl = value
      this.request.url = this._parsedUrl.pathname + this._parsedUrl.search
    } else {
      this._parsedUrl = undefined
      this.request.url = value
    }
  }

  /**{{- tsdoc(page="02-handlers.md", section="query") -}}*/
  get query () {
    this._query = this._query || Object.fromEntries(this.url.searchParams)
    return this._query
  }

  /**{{- tsdoc(page="02-handlers.md", section="body") -}}*/
  get body () {
    if (this._body) {
      return this._body
    }

    this._body = Promise.resolve((<any>this.handler).bodyParser(this.request))

    return this._body
  }

  /**{{- tsdoc(page="02-handlers.md", section="body") -}}*/
  set body (v) {
    this._body = Promise.resolve(v)
  }

  /**{{- tsdoc(page="02-handlers.md", section="accepts") -}}*/
  get accepts () {
    if (this._accepts) {
      return this._accepts
    }
    this._accepts = accepts(this.request)
    return this._accepts
  }

  static _bodyParser?: BodyParser
}

void `{% if selftest %}`;
export { GetSession, Context }
import { Handler } from '../core/middleware'
import { BodyParser } from '../core/body'
import {NoMatchError} from './errors'
import { Session } from './session'
import { Cookie } from './cookie'
/* {% if redis %} */import { WrappedNodeRedisClient } from 'handy-redis'/* {% endif %} */
/* {% if postgres %} */import { Client as PGClient, Pool as PGPool } from 'pg'/* {% endif %} */
void `{% endif %}`;


void `{% if selftest %}`;
import { Test } from '../middleware/test'
import { runserver } from '../bin/runserver'
import tap from 'tap'
import {inject} from '@hapi/shot'
/* c8 ignore next */
if (require.main === module) {
  const { test } = tap

  test('context.url may be set to a url', async (assert: Test) => {
    let called = null
    const handler = (context: Context) => {
      context.url = new URL('/hello/world', 'https://www.womp.com/')
      called = context.url
    }
    handler.route = 'GET /'
    const server = await runserver({
      middleware: [],
      bodyParsers: [],
      handlers: {
        handler,
      },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })

    assert.equal((called as any).pathname, '/hello/world')
    assert.same(response.payload, '')
  })

  test('context: has expected properties', async (assert) => {
    const mockRequest = {
      socket: {
        remoteAddress: '::80',
      },
      headers: {
        host: 'example.com:443',
        accept: 'text/plain;q=0.9, text/html;q=0.8',
      },
      url: 'https://example.com/hello?there=1',
      method: 'PROPFIND',
    }
    const now = Date.now()
    const ctx = new Context(<any>mockRequest, <any>{})

    assert.ok(ctx.start >= now)
    assert.equal(ctx.host, 'example.com')
    assert.equal(ctx.url.pathname, '/hello')
    assert.equal(ctx.query.there, '1')

    ;(ctx as any)._parsedUrl = { pathname: '/floo' }
    assert.equal(ctx.url.pathname, '/floo')
    assert.equal(ctx.headers, ctx.request.headers)
    assert.equal(ctx.method, ctx.request.method)

    assert.equal(ctx.accepts.type(['text/html', 'text/plain', 'application/json']), 'text/plain')

    ;(ctx as any)._accepts = accepts(<any>{ headers: { accept: '*/*' } })
    assert.equal(ctx.accepts.type(['text/html', 'text/plain', 'application/json']), 'text/html')
  })

  test('context: default body parser returns 415', async (assert) => {
    const handler = async (context: Context) => {
      await context.body
    }
    handler.route = 'GET /'
    const server = await runserver({
      middleware: [],
      bodyParsers: [],
      handlers: {
        handler,
      },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })

    assert.equal(response.statusCode, 415)
    assert.equal(JSON.parse(response.payload).message, 'Cannot parse request body')
  })

}
void `{% endif %}`;
