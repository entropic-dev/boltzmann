#!/usr/bin/env node
/* eslint-disable */
/* c8 ignore file */
'use strict'
// Boltzmann v0.5.3
/**/

const serviceName = _getServiceName()

function _getServiceName() {
  try {
    return process.env.SERVICE_NAME || require('./package.json').name.split('/').pop()
  } catch {
    return 'boltzmann'
  }
}

void ``;

import ships from 'culture-ships'
void ``;
const ship = ships.random()
void ``;

import { IncomingMessage, ServerResponse } from 'http'
import { URL } from 'url'
import * as uuid from 'uuid'
import { seal, unseal, defaults as ironDefaults } from '@hapi/iron'
import { Accepts } from 'accepts'
import { RouteOptions, Handler as FMWHandler, HTTPVersion, HTTPMethod } from 'find-my-way'
import Ajv from 'ajv'
import assert from 'assert'
import * as cookie from 'cookie'
void ``;

void ``;

void ``;

void ``;

void ``;

void ``;

void ``;
void ``;

import { Readable } from 'stream'

import type { RequestOptions as ShotRequestOptions, Listener, ResponseObject } from '@hapi/shot'
import type tap from 'tap'

import querystring from 'querystring'
import { promisify } from 'util'
import isDev from 'are-we-dev'
import fmw from 'find-my-way'
import accepts from 'accepts'
import { promises as fs } from 'fs'
import crypto from 'crypto'
import http from 'http'
import bole from '@entropic/bole'
import path from 'path'
import os from 'os'
void ``;
void ``;

const THREW = Symbol.for('threw')
const STATUS = Symbol.for('status')
const REISSUE = Symbol.for('reissue')
const HEADERS = Symbol.for('headers')
const TEMPLATE = Symbol.for('template')

type HttpMetadata = (
  { [HEADERS]: { [key: string]: string } } |
  { [STATUS]: number } |
  { [THREW]: boolean } |
  { [TEMPLATE]: string }
)

void ``




void ``;

interface ContentType {
  contentType: {
    vnd: string,
    type: string,
    subtype: string,
    charset: string,
    params: Map<string, string>
  }
}

type BodyInput = IncomingMessage & ContentType;

interface BodyParser {
  (request: BodyInput): unknown | Promise<unknown>
}

interface BodyParserDefinition {
  (next: BodyParser): BodyParser
}

function buildBodyParser (bodyParsers: BodyParserDefinition[]): BodyParser {
  const parserDefs = [_attachContentType as BodyParserDefinition, ...bodyParsers]
  return parserDefs.reduceRight((lhs: BodyParser, rhs: BodyParserDefinition) => rhs(lhs), (_) => {
    throw Object.assign(new Error('Cannot parse request body'), {
      [Symbol.for('status')]: 415
    })
  })
}

function _attachContentType (next: BodyParser): BodyParser {
  return (request: IncomingMessage) => {
    const [contentType, ...attrs] = (
      request.headers['content-type'] ||
      'application/octet-stream'
    ).split(';').map(xs => xs.trim())
    const attrsTuples = attrs.map(
      xs => xs.split('=').map(
        ys => ys.trim()
      ).slice(0, 2) as [string, string]
    )
    const params = new Map(attrsTuples)
    const charset = (params.get('charset') || 'utf-8').replace(/^("(.*)")|('(.*)')$/, '$2$4').toLowerCase()
    const [type, vndsubtype = ''] = contentType.split('/')
    const subtypeParts = vndsubtype.split('+')
    const subtype = subtypeParts.pop() || ''

    const augmentedRequest: IncomingMessage & ContentType = Object.assign(request, {
      contentType: {
        vnd: subtypeParts.join('+'),
        type,
        subtype,
        charset,
        params
      }
    })

    return next(augmentedRequest)
  }
}

void ``;

type Response = (
  void |
  string |
  AsyncIterable<Buffer> |
  Buffer |
  { [key: string]: any } |
  (AsyncIterable<Buffer> & HttpMetadata) |
  (Buffer & HttpMetadata) |
  ({ [key: string]: any } & HttpMetadata)
)

interface Handler {
  (context: Context): Promise<any> | any,
  method?: HTTPMethod[] | HTTPMethod,
  route?: string,
  version?: string,
  decorators?: Adaptor[],
  bodyParsers?: BodyParserDefinition[],
  middleware?: MiddlewareConfig[],
  // 
}

interface Adaptor {
  (next: Handler): Handler | Promise<Handler>
}

interface Middleware {
  (...args: any[]): Adaptor
  name?: string
}

type MiddlewareConfig = Middleware | [Middleware, ...any[]]

async function buildMiddleware (middleware: MiddlewareConfig[], router: Handler) {
  const middlewareToSplice = (
    isDev()
    ? (mw: Middleware) => [
      // 
      dev(mw.name),
      enforceInvariants()
    ]
    : (mw: Middleware) => [
      // 
      enforceInvariants()
    ]
  )
  const result = middleware.reduce((lhs: Adaptor[], rhs: MiddlewareConfig) => {
    const [mw, ...args] = Array.isArray(rhs) ? rhs : [rhs]
    return [...lhs, ...middlewareToSplice(mw), mw(...args)]
  }, []).concat(middlewareToSplice(route))

  // 


  return result.reduceRight(async (lhs: Promise<Handler>, rhs: Adaptor): Promise<Handler> => {
    return rhs(await lhs)
  }, Promise.resolve(router))
}

async function handler (context: Context) {
  const handler = context.handler as Handler
  // 
    return await handler(context)
    // 
}

void ``;

async function routes (handlers: Record<string, Handler>) {
  const routes = []
  for (let [key, handler] of Object.entries(handlers)) {
    if (typeof handler.route === 'string') {
      const [methodPart, ...routeParts] = handler.route.split(' ')
      const route = routeParts.length === 0 ? methodPart : routeParts.join(' ')
      const method = route.length === 0 ? ([] as HTTPMethod[]).concat(handler.method as HTTPMethod) || ['GET'] : methodPart as HTTPMethod

      const { version, middleware, decorators, ...rest } = handler

      let location = null
      let link = null

      if (isDev() && !process.env.TAP) {
        const getFunctionLocation = require('get-function-location')
        location = await getFunctionLocation(handler)
        link = `${location.source.replace('file://', 'vscode://file')}:${location.line}:${location.column}`
      }

      routes.push({
        key,
        location,
        link,
        method: ([] as HTTPMethod[]).concat(handler.method as HTTPMethod || method || 'GET' as 'GET'),
        route,
        version,
        middleware,
        handler,
        props: rest
      })
    }
  }

  return routes
}


void ``;

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

  /**{{ changelog(version = "0.0.0") }}
 * 
 * A unique string identifier for the request for tracing purposes. The value is
 * drawn from:
 * 
 * 1. `x-honeycomb-trace`
 * 1. `x-request-id`
 * 1. A generated [ship name from Iain M Bank's Culture series]( "https://en.wikipedia.org/wiki/Culture_series") (e.g.: `"ROU Frank Exchange Of Views"`)
 * 
 * **Example use:**
 * 
 * ````javascript
 * const bole = require('bole')
 * 
 * log.route = 'GET /'
 * async function log(context) {
 *   const logger = bole(context.id)
 *   logger.info('wow what a request')
 * }
 * ````
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/02-handlers#id")*/
  public id: string

  /**{{ changelog(version = "0.0.0") }}
 * 
 * A `Number` representing the start of the application request processing,
 * drawn from [`Date.now()`]( "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/now").
 * 
 * **Example use:**
 * 
 * ````javascript
 * timing.route = 'GET /'
 * async function timing(context) {
 *   const ms = Date.now() - context.start
 *   return `routing this request took ${ms} millisecond${ms === 1 ? '' : 's'}`
 * }
 * ````
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/02-handlers#start")*/
  public start: number

  /**{{ changelog(version = "0.0.0") }}
 * 
 * The remote IP address of the HTTP request sender. Drawn from [`request.socket.remoteAddress`]( "https://nodejs.org/api/net.html#net_socket_remoteaddress"),
 * falling back to `request.remoteAddress`. This value only represents the immediate connecting
 * socket IP address, so if the application is served through a CDN or other reverse proxy (like
 * nginx) the remote address refers to that host instead of the originating client.
 * 
 * **Example use:**
 * 
 * ````javascript
 * remote.route = 'GET /'
 * async function remote(context) {
 *   console.log(context.remote) // 127.0.0.1, say
 * }
 * ````
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/02-handlers#remote")*/
  public remote: string

  /**{{ changelog(version = "0.0.0") }}
 * 
 * The hostname portion of the [`Host` request header]( "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Host"), minus the port. Note that this
 * is the `Host` header received by the Node.JS process, which may not be the same as the
 * requested host (if, for example, your Boltzmann application is running behind a reverse
 * proxy such as nginx.)
 * 
 * **Example use:**
 * 
 * ````javascript
 * host.route = 'GET /'
 * async function host(context) {
 *   return context.host // "localhost", if running locally at "localhost:5000"
 * }
 * ````
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/02-handlers#host")*/
  public host: string

  /**{{ changelog(version = "0.0.0") }}
 * 
 * `context.params` contains an object mapping URL parameter names to the resolved
 * value for this request. Wildcard matches are available as `context.params['*']`.
 * 
 * **Example use:**
 * 
 * ````javascript
 * parameters.route = 'GET /:foo/bar/:baz'
 * async function parameters(context) {
 *   console.log(context.params) // { "foo": "something", "baz": "else" }
 * }
 * ````
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/02-handlers#params")*/
  public params: Record<string, any>

  /**{{ changelog(version = "0.5.0") }}
 * 
 * The handler function to be called once all app-attached middleware has
 * executed. If no route was matched, this property will refer to
 * `Context.prototype.handler`, which returns a `NoMatchError` with a `404 Not Found` status code. Any middleware attached to the handler will be applied
 * to the function & all handler-attached properties will be normalized.
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/02-handlers#handler")*/
  public handler: Handler = Context.baseHandler

  // 
  // 

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
      uuid.v4()
    )
    this._loadSession = async () => {
      throw new Error('To use context.session, attach session middleware to your app')
    }
  }

  static baseHandler (context: Context): Promise<any> {
    throw new NoMatchError(String(context.request.method), context.url.pathname)
  }

  // 

  get hasCookie () {
    return Boolean(this._cookie)
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
  get cookie () {
    this._cookie = this._cookie || Cookie.from(this.headers.cookie || '')
    return this._cookie
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
  get session (): Promise<Session> {
    return this._loadSession()
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
  get method(): string {
    return <string>this.request.method
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
  get headers(): Record<string, any> {
    return this.request.headers
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
      return this._parsedUrl
    }
    this._parsedUrl = new URL(String(this.request.url), `http://${this.headers.host || 'example.com'}`)
    return this._parsedUrl
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
    this._query = undefined
    if (value instanceof URL) {
      this._parsedUrl = value
      this.request.url = this._parsedUrl.pathname + this._parsedUrl.search
    } else {
      this._parsedUrl = undefined
      this.request.url = value
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
  get query () {
    this._query = this._query || Object.fromEntries(this.url.searchParams)
    return this._query
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
  get body () {
    if (this._body) {
      return this._body
    }

    this._body = Promise.resolve((<any>this.handler).bodyParser(this.request))

    return this._body
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
  set body (v) {
    this._body = Promise.resolve(v)
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
  get accepts () {
    if (this._accepts) {
      return this._accepts
    }
    this._accepts = accepts(this.request)
    return this._accepts
  }

  static _bodyParser?: BodyParser
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
class Cookie extends Map<string, cookie.CookieSerializeOptions & {value: string}> {
  public changed: Set<string>

  constructor(values: Iterable<[string, any]>) {
    super(values)
    this.changed = new Set()
  }

  set (key: string, value: string | Partial<cookie.CookieSerializeOptions> & {value: string}) {
    if (this.changed) {
      this.changed.add(key)
    }

    const defaults = {
      sameSite: true,
      secure: !isDev(),
      httpOnly: true,
    }
    return super.set(key, typeof value === 'string' ? {
      ...defaults,
      value
    } : {
      ...defaults,
      ...value
    })
  }

  delete (key: string) {
    this.changed.add(key)
    return super.delete(key)
  }

  collect (): string[] {
    const cookies = []
    for (const key of this.changed) {
      if (this.has(key)) {
        const result = this.get(key)
        if (!result) {
          throw new TypeError('invalid data in cookie')
        }
        const { value, ...opts } = result
        cookies.push(cookie.serialize(key, value, opts))
      } else {
        cookies.push(cookie.serialize(key, 'null', {
          httpOnly: true,
          expires: new Date(),
          maxAge: 0
        }))
      }
    }

    return cookies
  }

  static from (string: string): Cookie {
    return new Cookie(Object.entries(cookie.parse(string)))
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
class Session extends Map<string, any> {
  // 
  // 
  [REISSUE]: boolean
  public dirty = false

  constructor(public id: string | null, ...args: any) {
    super(...args)
    this[REISSUE] = false
  }

  reissue() {
    this[REISSUE] = true
  }

  set(key: string, value: any) {
    const old = this.get(key)
    if (value === old) {
      return super.set(key, value)
    }
    this.dirty = true
    return super.set(key, value)
  }

  delete(key: string) {
    if (!this.has(key)) {
      return super.delete(key)
    }
    this.dirty = true
    return super.delete(key)
  }
}

void ``;

void ``;

class BadSessionError extends Error {
  // 
  // 
  [STATUS]: number
  constructor () {
    super("Invalid session cookie")
    this[STATUS] = 400
  }
}

class NoMatchError extends Error {
  // 
  // 
  [STATUS]: number
  public __noMatch: boolean = true

  constructor(method: string, pathname: string) {
    super(`Could not find route for ${method} ${pathname}`)
    this[STATUS] = 404
    Error.captureStackTrace(this, NoMatchError)
  }
}

void ``;




void ``;

interface DebugLocationInfo {
  name: string,
  location: string
}
async function runserver ({
  middleware = _requireOr('./middleware', []).then(_processMiddleware),
  bodyParsers = _requireOr('./body', [urlEncoded, json]).then(_processBodyParsers),
  handlers = _requireOr('./handlers', {}),
}: {
  middleware?: MiddlewareConfig[] | Promise<MiddlewareConfig[]>,
  bodyParsers?: BodyParserDefinition[] | Promise<BodyParserDefinition[]>,
  handlers?: Record<string, Handler> | Promise<Record<string, Handler>>
}= {}) {
  const [resolvedMiddleware, resolvedBodyParsers, resolvedHandlers] = await Promise.all([
    <Promise<MiddlewareConfig[]>>middleware,
    <Promise<BodyParserDefinition[]>>bodyParsers,
    <Promise<Record<string, Handler>>>handlers,
  ])

  const server = http.createServer()
  let isClosing = false

  // When we're not in dev, handle SIGINT gracefully. Gracefully let open
  // connections complete, but let them know not to keep-alive!
  if (!isDev()) {
    process.on('SIGINT', () => {
      if (isClosing) {
        process.exit(1)
      }
      const logger = bole('boltzmann:server')
      logger.info('Caught SIGINT, preparing to shutdown. If running on the command line another ^C will close the app immediately.')
      isClosing = true
      server.close()
    })
  }

  Context._bodyParser = buildBodyParser(resolvedBodyParsers)
  const respond = await buildMiddleware([[route, resolvedHandlers], ...resolvedMiddleware], handler)

  // 

  server.on('request', async (req, res) => {
    const context = new Context(req, res)

    // 

    let body = await respond(context)

    if (body[THREW]) {
      body = {
        message: body.message,
        [isDev() ? 'stack' : Symbol('stack')]: body.stack,
        [STATUS]: body[STATUS],
        [HEADERS]: body[HEADERS],
        ...body
      }
    }

    const isPipe = body && body.pipe
    const {
      [STATUS]: status,
      [HEADERS]: headers,
    } = body || {}

    if (context.hasCookie) {
      const setCookie = context.cookie.collect()
      if (setCookie.length) {
        headers['set-cookie'] = setCookie
      }
    }

    headers['x-clacks-overhead'] = 'GNU/Terry Pratchett'
    if (isClosing) {
      headers.connection = isClosing ? 'close' : 'keep-alive'
    }

    res.writeHead(status, headers)
    if (isPipe) {
      body.pipe(res)
    } else if (Buffer.isBuffer(body)) {
      res.end(body)
    } else if (body) {
      res.end(JSON.stringify(body))
    } else {
      res.end()
    }
  })

  return server
}

void ``;


void ``;

async function printRoutes () {
  const metadata = await routes(await _requireOr('./handlers', {}))

  const maxRouteLen = metadata.reduce((acc, { route }) => Math.max(acc, route.length), 0)
  const maxHandlerLen = metadata.reduce((acc, { handler, key }) => Math.max(acc, (handler.name || key).length), 0)
  const maxMethodLen = metadata
    .map(({method}) => ([] as any[]).concat(method))
    .flat()
    .reduce((acc, method) => Math.max(acc, method.length), 0)

  const map: Record<string, string> = {
    'GET': '\x1b[32;1m',
    'DELETE': '\x1b[31m',
    'POST': '\x1b[33;1m',
    'PATCH': '\x1b[33;1m',
    'PUT': '\x1b[35;1m',
    '*': '\x1b[36;1m'
  }

  const ansi = require('ansi-escapes')
  const supportsHyperlinks = require('supports-hyperlinks')

  for (const meta of metadata) {
    for (let originalMethod of meta.method) {
      let method = (originalMethod as string).toUpperCase().trim()
      method = `${(map[originalMethod] || map['*'])}${originalMethod}\x1b[0m`
      method = method + ' '.repeat(Math.max(0, maxMethodLen - originalMethod.length + 1))

      const rlen = meta.route.trim().length
      const route = meta.route.trim().replace(/:([^\/-]+)/g, (_, m) => {
        return `\x1b[4m:${m}\x1b[0m`
      }) + ' '.repeat(Math.max(0, maxRouteLen - rlen) + 1)

      const handler = (meta.handler.name || meta.key).padEnd(maxHandlerLen + 1)

      const source = meta.location.source.replace(`file://${process.cwd()}`, '.')
      let filename = `${source}:${meta.location.line}:${meta.location.column}`
      filename = (
        supportsHyperlinks.stdout
        ? ansi.link(filename, meta.link)
        : filename
      )

      console.log(`  ${method}${route}${handler} \x1b[38;5;8m(\x1b[4m${filename}\x1b[0m\x1b[38;5;8m)\x1b[0m`)
    }
  }

  if (supportsHyperlinks.stdout) {
    console.log()
    console.log('(hold ⌘ and click on any filename above to open in VSCode)')
  }
  console.log()
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
function json (next: BodyParser) {
  return async (request: BodyInput) => {
    if (
      request.contentType.type === 'application' &&
      request.contentType.subtype === 'json' &&
      request.contentType.charset === 'utf-8'
    ) {
      const buf = await _collect(request)
      try {
        return JSON.parse(String(buf))
      } catch {
        const message = (
          isDev()
          ? 'Could not parse request body as JSON (Did the request include a `Content-Type: application/json` header?)'
          : 'Could not parse request body as JSON'
        )

        throw Object.assign(new Error(message), {
          [STATUS]: 422
        })
      }
    }

    return next(request)
  }
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
function urlEncoded (next: BodyParser) {
  return async (request: BodyInput) => {
    if (
      request.contentType.type !== 'application' ||
      request.contentType.subtype !== 'x-www-form-urlencoded' ||
      request.contentType.charset !== 'utf-8'
    ) {
      return next(request)
    }

    const buf = await _collect(request)
    // XXX: AFAICT there's no way to get the querystring parser to throw, hence
    // the lack of a try/catch here.
    return querystring.parse(String(buf))
  }
}

void ``;




void ``;

function applyHeaders (headers: Record<string, string | string[]> = {}) {
  return (next: Handler) => {
    return async function xfo (context: Context) {
      const result = await next(context)
      Object.assign(result[Symbol.for('headers')], headers)
      return result
    }
  }
}

type XFOMode = 'DENY' | 'SAMEORIGIN'
function applyXFO (mode: XFOMode) {
  if (!['DENY', 'SAMEORIGIN'].includes(mode)) {
    throw new Error('applyXFO(): Allowed x-frame-options directives are DENY and SAMEORIGIN.')
  }
  return applyHeaders({ 'x-frame-options': mode })
}

void ``;

void ``;

const hangWarning: unique symbol = Symbol('hang-stall')
const hangError: unique symbol  = Symbol('hang-error')

function dev(
  nextName?: string,
  warnAt = Number(process.env.DEV_LATENCY_WARNING_MS) || 500,
  errorAt = Number(process.env.DEV_LATENCY_ERROR_MS) || 2000
) {
  return function devMiddleware (next: Handler) {
    return async function inner(context: Context) {
      const req = context.request
      if (context[hangWarning as any]) {
        clearTimeout(context[hangWarning as any])
      }
      context[hangWarning as any] = setTimeout(() => {
        console.error(
          `⚠️ Response from ${nextName} > ${warnAt}ms fetching "${req.method} ${
            req.url
          }".`
        )
        console.error(
          '\x1b[037m - (Tune timeout using DEV_LATENCY_WARNING_MS env variable.)\x1b[00m'
        )
      }, warnAt)

      if (context[hangError as any]) {
        clearTimeout(context[hangError as any])
      }
      context[hangError as any] = setTimeout(() => {
        console.error(
          `🛑 STALL: Response from ${nextName} > ${errorAt}ms: "${req.method} ${
            req.url
          }". (Tune timeout using DEV_LATENCY_ERROR_MS env variable.)`
        )
        console.error(
          '\x1b[037m - (Tune timeout using DEV_LATENCY_ERROR_MS env variable.)\x1b[00m'
        )
      }, errorAt)

      const result = await next(context)
      clearTimeout(context[hangWarning as any])
      context[hangWarning as any] = null
      clearTimeout(context[hangError as any])
      context[hangError as any] = null
      return result
    }
  }
}

void ``;


void ``;

function handleCORS ({
  origins = isDev() ? '*' : String(process.env.CORS_ALLOW_ORIGINS || '').split(','),
  methods = String(process.env.CORS_ALLOW_METHODS || '').split(',') as HTTPMethod[],
  headers = String(process.env.CORS_ALLOW_HEADERS || '').split(',')
}: {
  origins?: string[] | string,
  methods?: HTTPMethod[] | HTTPMethod,
  headers?: string[] | string
}) {
  const originsArray = Array.isArray(origins) ? origins : [origins]
  const includesStar = originsArray.includes('*')

  return (next: Handler) => {
    return async function cors (context: Context) {
      const reflectedOrigin = (
        includesStar
        ? '*'
        : (
          originsArray.includes(String(context.headers.origin))
          ? context.headers.origin
          : false
        )
      )

      const response = (
        context.method === 'OPTIONS'
        ? Object.assign(Buffer.from(''), {
            [Symbol.for('status')]: 204,
          })
        : await next(context)
      )

      response[Symbol.for('headers')] = {
        ...(reflectedOrigin ? { 'Access-Control-Allow-Origin': reflectedOrigin } : {}),
        'Access-Control-Allow-Methods': ([] as any[]).concat(methods).join(','),
        'Access-Control-Allow-Headers': ([] as any[]).concat(headers).join(',')
      }

      return response
    }
  }
}

void ``;

void ``;

function enforceInvariants () {
  return function invariantMiddleware (next: Handler) {
    // the "...args" here are load-bearing: this is applied between
    // decorators _and_ middleware
    return async function invariant (ctx: Context) {
      let error, result

      try {
        result = await next(ctx)
      } catch (err) {
        error = err
      }

      const body = error || result || ''
      const isPipe = body && body.pipe

      const {
        [STATUS]: status = error ? 500 : result ? 200 : 204,
        [HEADERS]: headers = {},
      } = body || {}

      if (!headers['content-type']) {
        if (typeof body === 'string') {
          headers['content-type'] = 'text/plain; charset=utf-8'
        } else if (isPipe) {
          headers['content-type'] = 'application/octet-stream'
        } else {
          // 
          headers['content-type'] = 'application/json; charset=utf-8'
          // 
        }
      }

      if (error) {
        error[STATUS] = status
        error[HEADERS] = headers
        error[THREW] = true
        return error
      }

      if (result && typeof result === 'object') {
        result[STATUS] = status
        result[HEADERS] = headers
        return result
      }

      if (!result) {
        result = ''
      }

      const stream = Buffer.from(String(result), 'utf8')
      stream[STATUS as any] = status
      stream[HEADERS as any] = headers
      return stream
    }
  }
}






void ``;

function log ({
  logger = bole(process.env.SERVICE_NAME || 'boltzmann'),
  level = process.env.LOG_LEVEL || 'debug',
  stream = process.stdout
} = {}) {
  if (isDev()) {
    const pretty = require('bistre')({ time: true })
    pretty.pipe(stream)
    stream = pretty
  }
  bole.output({ level, stream })

  return function logMiddleware (next: Handler) {
    return async function inner (context: Context) {
      const result = await next(context)

      const body = result || {}
      if (body && body[THREW] && body.stack) {
        logger.error(body)
      }

      logger.info({
        message: `${body[Symbol.for('status')]} ${context.request.method} ${
          context.request.url
        }`,
        id: context.id,
        ip: context.remote,
        host: context.host,
        method: context.request.method,
        url: context.request.url,
        elapsed: Date.now() - context.start,
        status: body[Symbol.for('status')],
        userAgent: context.request.headers['user-agent'],
        referer: context.request.headers.referer
      })

      return body
    }
  }
}

void ``;


void ``;

function handlePing () {
  return (next: Handler) => (context: Context) => {
    if (context.url.pathname === '/monitor/ping') {
      return ship
    }
    return next(context)
  }
}



void ``;

function route (handlers: Record<string, Handler> = {}) {
  const wayfinder = fmw({})

  return async (next: Handler) => {
    for (let handler of Object.values(handlers)) {
      if (typeof handler.route === 'string') {
        let [method, ...routeParts] = handler.route.split(' ')
        let route = routeParts.join(' ')
        if (route.length === 0) {
          route = method
          method = (handler.method || 'GET') as string
        }
        const opts: RouteOptions = {}
        if (handler.version) {
          opts.constraints = { version: handler.version }
          handler.middleware = handler.middleware || []
          handler.middleware.push([vary, 'accept-version'])
        }

        const { version, middleware, decorators, bodyParsers, ...rest } = handler

        let location = null
        // 

        if (Array.isArray(decorators)) {
          handler = await decorators.reduce((lhs: Adaptor[], rhs: Adaptor) => {
            return [...lhs, enforceInvariants(), rhs]
          }, []).reduceRight(async (lhs, rhs) => rhs(await lhs), Promise.resolve(enforceInvariants()(handler) as Handler))
        }

        const bodyParser = (
          Array.isArray(bodyParsers)
          ? buildBodyParser(bodyParsers)
          : Context._bodyParser
        )

        if (Array.isArray(middleware)) {
          const name = handler.name
          handler = await buildMiddleware(middleware, handler)

          // preserve the original name, please
          Object.defineProperty(handler, 'name', { value: name })
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
        })

        wayfinder.on(<HTTPMethod | HTTPMethod[]>method, route, opts, <FMWHandler<HTTPVersion.V1>><unknown>handler)
      }
    }

    return (context: Context) => {
      const { pathname } = context.url
      const method = context.request.method || 'GET'
      const match = wayfinder.find(method as HTTPMethod, pathname, ...(
        context.request.headers['accept-version']
        ? [{version: context.request.headers['accept-version']}]
        : [{version: ''}]
      ))

      if (!match) {
        return next(context)
      }

      context.params = match.params
      context.handler = <Handler><unknown>match.handler
      return next(context)
    }
  }
}

void ``;

let IN_MEMORY = new Map()

interface LoadSession {
  (context: Context, id: string): Promise<Record<string, unknown>>
}

interface SaveSession {
  (context: Context, id: string, session: Record<string, unknown>, expirySeconds: number): Promise<void>
}

const inMemorySessionLoad: LoadSession = async (_: Context, id: string) => JSON.parse(IN_MEMORY.get(id))
const redisSessionLoad: LoadSession = async (context: Context, id: string) => {
  return JSON.parse(await context.redisClient.get(id) || '{}')
}
const inMemorySessionSave: SaveSession = async (_: Context, id: string, session: Record<string, unknown>) => {
  IN_MEMORY.set(id, JSON.stringify(session));
}
const redisSessionSave: SaveSession = async (context: Context, id: string, session: Record<string, unknown>, expirySeconds: number) => {
  await context.redisClient.setex(id, expirySeconds + 5, JSON.stringify(session))
}

let defaultSessionLoad = inMemorySessionLoad
// 

let defaultSessionSave = inMemorySessionSave
// 

function session ({
  cookie = process.env.SESSION_ID || 'sid',
  secret = process.env.SESSION_SECRET,
  salt = process.env.SESSION_SALT,
  logger = bole('boltzmann:session'),
  load = defaultSessionLoad,
  save = defaultSessionSave,
  iron = {},
  cookieOptions = {},
  expirySeconds = 60 * 60 * 24 * 365
} = {}) {
  expirySeconds = Number(expirySeconds) || 0
  if (typeof load !== 'function') {
    throw new TypeError('`load` must be a function, got ' + typeof load)
  }

  if (typeof save !== 'function') {
    throw new TypeError('`save` must be a function, got ' + typeof save)
  }

  secret = Buffer.isBuffer(secret) ? secret : String(secret)
  if (secret.length < 32) {
    throw new RangeError('`secret` must be a string or buffer at least 32 units long')
  }

  salt = Buffer.isBuffer(salt) ? salt : String(salt)
  if (salt.length == 0) {
    throw new RangeError('`salt` must be a string or buffer at least 1 unit long; preferably more')
  }

  return (next: Handler) => {
    return async (context: Context) => {
      let _session: Session | undefined
      context._loadSession = async () => {
        if (_session) {
          return _session
        }

        const sessid = context.cookie.get(cookie)
        if (!sessid) {
          _session = new Session(null, [['created', Date.now()]])
          return _session
        }

        let clientId
        try {
          clientId = String(await unseal(sessid.value, String(secret), { ...ironDefaults, ...iron }))
        } catch (err) {
          logger.warn(`removing session that failed to decrypt; request_id="${context.id}"`)
          _session = new Session(null, [['created', Date.now()]])
          return _session
        }

        if (!clientId.startsWith('s_') || !uuid.validate(clientId.slice(2).split(':')[0])) {
          logger.warn(`caught malformed session; clientID="${clientId}"; request_id="${context.id}"`)
          throw new BadSessionError()
        }

        const id = `s:${crypto.createHash('sha256').update(clientId).update(String(salt)).digest('hex')}`

        const sessionData = await load(context, id)
        _session = new Session(clientId, Object.entries(sessionData))

        return _session
      }

      const response = await next(context)

      if (!_session) {
        return response
      }

      if (!_session.dirty) {
        return response
      }

      const needsReissue = !_session.id || _session[REISSUE]
      const issued = Date.now()
      const clientId = needsReissue ? `s_${uuid.v4()}:${issued}` : _session.id
      const id = `s:${crypto.createHash('sha256').update(<string>clientId).update(<string>salt).digest('hex')}`

      _session.set('modified', issued)
      await save(context, id, Object.fromEntries(_session.entries()), expirySeconds)

      if (needsReissue) {
        const sealed = await seal(<string>clientId, <string>secret, { ...ironDefaults, ...iron })

        context.cookie.set(cookie, {
          value: sealed,
          httpOnly: true,
          sameSite: true,
          maxAge: expirySeconds,
          ...(expirySeconds ? {} : {expires: new Date(Date.now() + 1000 * expirySeconds)}),
          ...cookieOptions
        })
      }

      return response
    }
  }
}


void ``;



void ``;

interface ReachabilityResult {
  status: 'failed' | 'healthy' | string,
  error: Error | null,
  latency: number
}

interface ReachabilityCheck {
  (context: Context, meta: ReachabilityResult): Promise<void> | void
}

const defaultReachability: Record<string, ReachabilityCheck> = {}
// 
// 

function handleStatus ({
  git = process.env.GIT_COMMIT,
  reachability = defaultReachability,
  extraReachability = _requireOr('./reachability', {})
}: {
  git?: string,
  reachability?: Record<string, ReachabilityCheck>,
  extraReachability?: Promise<Record<string, ReachabilityCheck>>,
} = {}) {
  return async (next: Handler) => {
    reachability = { ...reachability, ...await extraReachability }

    const hostname = os.hostname()
    let requestCount = 0
    const statuses: Record<number, number> = {}
    const reachabilityEntries = Object.entries(reachability)
    return async function monitor (context: Context) {
      switch (context.url.pathname) {
        case '/monitor/status':
          const downstream: Record<string, ReachabilityResult> = {}
          for (const [name, test] of reachabilityEntries) {
            const meta: ReachabilityResult = {status: 'failed', latency: 0, error: null}
            const start = Date.now()
            try {
              await test(context, meta)
              meta.status = 'healthy'
            } catch (err) {
              meta.error = err
            } finally {
              meta.latency = Date.now() - start
            }
            downstream[name] = meta
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
          }

        default:
          ++requestCount
          const result = await next(context)
          const body = result || {}
          statuses[body[STATUS]] = statuses[body[STATUS]] || 0
          ++statuses[body[STATUS]]
          return result
      }
    }
  }
}

// 
// 

// 


void ``;

type BoltzmannShotRequestOptions = Partial<ShotRequestOptions> & { body?: string | Buffer };
type Test = (typeof tap.Test)["prototype"]
type TestResponse = ResponseObject & { json?: ReturnType<JSON['parse']> }
type BoltzmannTest = Test & {
  // 
  // 
  request(opts: BoltzmannShotRequestOptions): Promise<TestResponse>
}
type TestHandler = (t: Test) => Promise<void> | void
type BoltzmannTestHandler = (t: BoltzmannTest) => Promise<void> | void

let savepointId = 0

function test({
  middleware = Promise.resolve([] as MiddlewareConfig[]),
  handlers = _requireOr('./handlers', {}),
  bodyParsers = _requireOr('./body', [urlEncoded, json]),
  after = require('tap').teardown,
}: {
  middleware?: Promise<MiddlewareConfig[]> | MiddlewareConfig[]
  handlers?: Promise<Record<string, Handler>> | Record<string, Handler>
  bodyParsers?: Promise<BodyParserDefinition[]> | BodyParserDefinition[]
  after?: (...args: any[]) => void
}) {
  // 

  // 

  // 

  const { inject } = require('@hapi/shot')
  return (inner: (t: BoltzmannTest) => Promise<unknown> | unknown) => {
    return async (outerAssert: Test) => {
      const assert: BoltzmannTest = <BoltzmannTest>outerAssert
      const [resolvedHandlers, resolvedBodyParsers, resolvedMiddleware] = await Promise.all([
        handlers,
        bodyParsers,
        middleware,
      ])

      // 
      // 

      const server = await runserver({
        middleware: resolvedMiddleware,
        bodyParsers: resolvedBodyParsers,
        handlers: resolvedHandlers,
      })
      const [onrequest] = server.listeners('request')
      const request = async ({
        method = 'GET',
        url = '/',
        headers = {},
        body,
        payload,
        ...opts
      }: BoltzmannShotRequestOptions = {}) => {
        headers = headers || {}
        payload = payload || body
        if (!Buffer.isBuffer(payload) && typeof payload !== 'string' && payload) {
          payload = JSON.stringify(payload)
          headers['content-type'] = 'application/json'
        }

        const response = await inject(<Listener>onrequest, {
          method,
          url,
          headers,
          payload,
          ...opts,
        })

        Object.defineProperty(response, 'json', {
          get() {
            return JSON.parse(this.payload)
          },
        })

        return response
      }
      assert.request = request

      try {
        await inner(<BoltzmannTest>assert)
      } finally {
        // 
      }
    }
  }
}

void ``;

function vary (on: string[] | string = []) {
  const headers = [].concat(<any>on) as string[]

  return (next: Handler) => {
    return async (context: Context) => {
      const response = await next(context)
      response[HEADERS].vary = [].concat(response[HEADERS].vary || [], <any>headers)
      return response
    }
  }
}

void ``;

void ``;

const addAJVFormats = (validator: Ajv): Ajv => (require('ajv-formats')(validator), validator)
const addAJVKeywords = (validator: Ajv): Ajv => (require('ajv-keywords')(validator), validator)

function validateBody(schema: object, {
  ajv: validator = addAJVFormats(addAJVKeywords(new Ajv(<any>{
    useDefaults: true,
    allErrors: true,
    strictTypes: isDev() ? true : "log",
  }))),
}: {
  ajv?: Ajv
} = {}) {
  const compiled = validator.compile(schema && (schema as any).isFluentSchema ? schema.valueOf() : schema)
  return function validate (next: Handler) {
    return async (context: Context) => {
      const subject = await context.body
      const valid = compiled(subject)
      if (!valid) {
        const newBody = Promise.reject(Object.assign(
          new Error('Bad request'),
          { errors: compiled.errors, [STATUS]: 400 }
        ))
        newBody.catch(() => {})
        context.body = newBody
      } else {
        context.body = Promise.resolve(subject)
      }

      return next(context)
    }
  }
}

function validateBlock(what: (c: Context) => object) {
  return function validate(schema: object, {
    ajv: validator = addAJVFormats(addAJVKeywords(new Ajv(<any>{
      useDefaults: true,
      allErrors: true,
      coerceTypes: 'array',
      strictTypes: isDev() ? true : "log",
    }))),
  }: {
    ajv?: Ajv
  } = {}) {
    const compiled = validator.compile(schema && (schema as any).isFluentSchema ? schema.valueOf() : schema)
    return function validate (next: Handler) {
      return async (context: Context) => {
        const subject = what(context)
        const valid = compiled(subject)
        if (!valid) {
          return Object.assign(new Error('Bad request'), {
            [THREW]: true,
            [STATUS]: 400,
            errors: compiled.errors
          })
        }

        return next(context)
      }
    }
  }
}

const validateQuery = validateBlock(ctx => ctx.query)
const validateParams = validateBlock(ctx => ctx.params)

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
 * \[`context.body`\] and validates it against the given schema, throwing a `400 Bad Request` error on validation failure. If the body passes validation it is
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
}

void ``;

void ``;



void ``;

async function _collect(request: IncomingMessage) {
  const acc = []
  for await (const chunk of request) {
    acc.push(chunk)
  }
  return Buffer.concat(acc)
}

type MiddlewareImport = { APP_MIDDLEWARE: MiddlewareConfig[] } | MiddlewareConfig[]
function _processMiddleware(
  middleware: MiddlewareImport
): MiddlewareConfig[] {
  if (Array.isArray(middleware)) {
    return middleware
  } else {
    return middleware.APP_MIDDLEWARE
  }
}

type BodyImport = { APP_BODY_PARSERS: BodyParserDefinition[] } | BodyParserDefinition[]
function _processBodyParsers(parsers: BodyImport) {
  if (Array.isArray(parsers)) {
    return parsers
  } else {
    return parsers.APP_BODY_PARSERS
  }
}

async function _requireOr(target: string, value: any) {
  try {
    return require(target)
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && err.requireStack && err.requireStack[0] === __filename) {
      return value
    }
    throw err
  }
}

void ``;

void ``

const body = {
  json,
  urlEncoded,
  urlencoded: urlEncoded,
}

const decorators = {
  validate,
  test,
}

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
 * field. This is set by examining headers for an existing id. Boltzmann consults `x-honeycomb-trace`
 * and `x-request-id` before falling back to generating a request id using a short randomly-selected
 * string.
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

  /**[To be documented]( "#TKTKTK")
 * 
 * ---
 * 
 * [Docs]("https://www.boltzmann.dev/en/latest/docs/reference/03-middleware#test")*/
  test,
  validate,
}

export {
  BodyInput,
  BodyParserDefinition,
  BodyParser,
  MiddlewareConfig,
  Middleware,
  LoadSession,
  SaveSession,
  Adaptor,
  Handler,
  Handler as Next,
  Response,
  BoltzmannTest,
  TestResponse,
  Test,
  TestHandler,
  BoltzmannTestHandler,
  BoltzmannTestHandler as AugmentedTestHandler,
  Context,
  runserver as main,
  middleware,
  body,
  decorators,
  routes,
  printRoutes,
}

// 




  void ``;

/* c8 ignore next */
if (require.main === module && !process.env.TAP) {
  function passthrough() {
    return (next: Handler) => (context: Context) => next(context)
  }

  runserver({
    middleware: (_requireOr('./middleware', [] as MiddlewareConfig[]) as Promise<MiddlewareConfig[]>)
      .then(_processMiddleware)
      .then((mw) => {
        // 
        // 
        const acc = []

        // 

        // 
        acc.push(handlePing)
        // 

        // 

        acc.push(log)

        // 

        // 
        
        acc.push(...mw)

        // 
        acc.push(handleStatus)
        // 

        return acc.filter(Boolean)
      }),
  })
    .then((server) => {
      server.listen(Number(process.env.PORT) || 5000, () => {
        const addrinfo = server.address()
        if (!addrinfo) {
          return
        }
        bole('boltzmann:server').info(`now listening on port ${typeof addrinfo == 'string' ? addrinfo : addrinfo.port}`)
      })
    })
    .catch((err) => {
      console.error(err.stack)
      process.exit(1)
    })
}


