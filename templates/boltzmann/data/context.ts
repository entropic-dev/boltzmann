// {% if selftest %}
import { IncomingMessage, ServerResponse } from 'http'
import { default as accepts, Accepts } from 'accepts'
import { URL } from 'url'
import { v4 } from 'uuid'

import { Handler } from '../core/middleware'
import { BodyParser } from '../core/body'
import {NoMatchError} from './errors'
import { Session } from './session'
import { Cookie } from './cookie'
/* {% if redis %} */import { IHandyRedis } from 'handy-redis'/* {% endif %} */
/* {% if postgres %} */import { Client as PGClient, PoolClient as PGPoolClient, Pool as PGPool } from 'pg'/* {% endif %} */
// {% endif %}

/* {% if selftest %} */export /* {% endif %} */interface LoadSession {
  (): Promise<Session>
}

/* {% if selftest %} */export /* {% endif %} */class Context {
  private _accepts?: Accepts
  private _query?: Record<string, any>
  private _parsedUrl?: URL
  private _body?: Promise<Record<string, any>>
  private _cookie?: Cookie
  public _loadSession: LoadSession
  public id: string
  public start: number
  public remote: string
  public host: string
  public params: Record<string, any>
  public handler: Handler = this.baseHandler

  // {% if redis %}
  public _redisClient?: IHandyRedis
  // {% endif %}
  // {% if postgres %}
  public _postgresPool?: PGPool
  public _postgresConnection?: Promise<PGClient | PGPoolClient>
  // {% endif %}

  [extensions: string]: any

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
      v4()
    )
    this._loadSession = async () => {
      throw new Error('To use context.session, attach session middleware to your app')
    }
  }

  baseHandler (_: Context): Promise<any> {
    throw new NoMatchError(String(this.request.method), this.url.pathname)
  }

  // {% if postgres %}
  get postgresClient (): Promise<PGPoolClient | PGClient> {
    if (!this._postgresPool) {
      throw new Error('Cannot fetch postgresClient before a pool is assigned (middleware should do this.)')
    }
    this._postgresConnection = this._postgresConnection || this._postgresPool.connect()
    return this._postgresConnection
  }
  // {% endif %}

  get hasCookie () {
    return Boolean(this._cookie)
  }

  get cookie () {
    this._cookie = this._cookie || Cookie.from(this.headers.cookie || '')
    return this._cookie
  }

  /** @type {Promise<Session>} */
  get session () {
    return this._loadSession()
  }

  // {% if redis %}
  /** @type {redis.IHandyRedis} */
  get redisClient (): IHandyRedis {
    if (!this._redisClient) {
      throw new Error('No redis client available')
    }
    return this._redisClient
  }
  // {% endif %}

  /** @type {string} */
  get method() {
    return this.request.method
  }

  /** @type {Object<string,string>} */
  get headers() {
    return this.request.headers
  }

  // {% if honeycomb %}
  get traceURL () {
    const url = new URL(`https://ui.honeycomb.io/${process.env.HONEYCOMBIO_TEAM}/datasets/${process.env.HONEYCOMBIO_DATASET}/trace`)
    url.searchParams.set('trace_id', this._honeycombTrace.payload['trace.trace_id'])
    url.searchParams.set('trace_start_ts', String(Math.floor(this._honeycombTrace.startTime/1000 - 1)))
    return String(url)
  }
  // {% endif %}

  get url() {
    if (this._parsedUrl) {
      return this._parsedUrl
    }
    this._parsedUrl = new URL(String(this.request.url), `http://${this.headers.host || 'example.com'}`)
    return this._parsedUrl
  }

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

  get query () {
    this._query = this._query || Object.fromEntries(this.url.searchParams)
    return this._query
  }

  /** @type {Promise<Object>} */
  get body () {
    if (this._body) {
      return this._body
    }

    this._body = Promise.resolve((<any>this.handler).bodyParser(this.request))

    return this._body
  }

  set body (v) {
    this._body = Promise.resolve(v)
  }

  get accepts () {
    if (this._accepts) {
      return this._accepts
    }
    this._accepts = accepts(this.request)
    return this._accepts
  }

  static _bodyParser?: BodyParser
}


/* {% if selftest %} */
import { Test } from '../middleware/test'
import { runserver } from '../bin/runserver'
import tap from 'tap'
import {inject} from '@hapi/shot'
/* istanbul ignore next */
{
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
/* {% endif %} */
