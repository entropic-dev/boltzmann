// {% if selftest %}
import { Cookie } from './cookie'
// {% endif %}
import { v4 } from 'uuid'
import { default as accepts, Accepts } from 'accepts'
import { IncomingMessage, ServerResponse } from 'http'
import { URL } from 'url'

import { Handler } from '../core/middleware'

/* {% if redis %} */import { IHandyRedis } from 'handy-redis'/* {% endif %} */
/* {% if postgres %} */import { Client as PGClient, PoolClient as PGPoolClient, Pool as PGPool } from 'pg'/* {% endif %} */

type Session = number;
/* {% if selftest %} */export /* {% endif %} */interface LoadSession {
  (): Promise<Session>
}

/* {% if selftest %} */export /* {% endif %} */class Context {
  private _accepts?: Accepts
  private _query?: Record<string, any>
  private _parsedUrl?: URL
  private _body?: Record<string, any>
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
  get postgresClient () {
    if (!this._postgresPool) {
      throw new Error('Cannot fetch postgresClient before a pool is assigned (middleware should do this.)')
    }
    this._postgresConnection = this._postgresConnection || this._postgresPool.connect()
    return this._postgresConnection
  }
  // {% endif %}

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
  get redisClient () {
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

  static _bodyParser = null
}

