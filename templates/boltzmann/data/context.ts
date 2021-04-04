// {% if selftest %}
import { Cookie } from './cookie'
// {% endif %}
import { v4 } from 'uuid'
import { Accepts } from 'accepts'
import { IncomingMessage, OutgoingMessage } from 'http'
import { URL } from 'url'

export class Context {
  private _accepts: Accepts
  private _response: OutgoingMessage
  private _parsedUrl?: URL
  private _body?: Record<string, any>
  public id: string
  public start: number
  public remote: string
  public host: string
  public params: Record<string, any>

  constructor(private request: IncomingMessage, response: OutgoingMessage) {
    this.request = request
    this.start = Date.now()
    this.remote = request.socket
      ? request.socket.remoteAddress.replace('::ffff:', '')
      : ''
    const [host,] = request.headers['host'].split(':')
    this.host = host
    this.params = {}

    this._parsedUrl = null
    this._body = null
    this._accepts = null
    this._response = response // do not touch this
    this.id = request.headers[TRACE_HTTP_HEADER] || request.headers['x-request-id'] || v4()
    this._cookie = null
    this._loadSession = async () => {
      throw new Error('To use context.session, attach session middleware to your app')
    }

    // {% if redis %}
    this._redisClient = null
    // {% endif %}
    // {% if postgres %}
    this._postgresPool = null
    this._postgresConnection = null
    // {% endif %}
  }

  handler (context) {
    throw new NoMatchError(this.request.method, this.url.pathname)
  }

  // {% if postgres %}
  /** @type {Promise<pg.Client>} */
  get postgresClient () {
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
    url.searchParams.set('trace_start_ts', Math.floor(this._honeycombTrace.startTime/1000 - 1))
    return String(url)
  }
  // {% endif %}

  get url() {
    if (this._parsedUrl) {
      return this._parsedUrl
    }
    this._parsedUrl = new URL(this.request.url, `http://${this.headers.host || 'example.com'}`)
    return this._parsedUrl
  }

  set url(value) {
    if (value instanceof URL) {
      this._parsedUrl = value
      this.request.url = this._parsedUrl.pathname + this._parsedUrl.search
    } else {
      this._parsedUrl = null
      this.request.url = value
    }
  }

  get query () {
    return Object.fromEntries(this.url.searchParams)
  }

  /** @type {Promise<Object>} */
  get body () {
    if (this._body) {
      return this._body
    }

    this._body = Promise.resolve(this.handler.bodyParser(this.request))

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


