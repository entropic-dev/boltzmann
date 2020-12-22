{% if not selftest %}/* eslint-disable */{% endif %}
declare module './boltzmann.js'
/// <reference types='node' />
import { IncomingMessage, OutgoingMessage } from 'http'
import { URL } from 'url'
import { Accepts } from 'accepts'
import { Cookie } from 'cookie'
import { Test } from 'tap'
{%- if postgres %}
import { Client } from 'pg'
{%- endif -%}
{%- if redis %}
import { IHandyRedis } from 'handy-redis'
{% endif -%}

declare const HEADER: unique symbol
declare const STATUS: unique symbol
declare const TEMPLATE: unique symbol

export * from './boltzmann.js'
export declare type BodyNext = (readable: IncomingMessage) => Promise<{ [key: string]: any }>
export declare type BodyHandler = (
  readable: IncomingMessage
) => { [key: string]: any } | Promise<{ [key: string]: any }>
export declare type BodyParser = (next: BodyNext) => BodyHandler
export declare type HttpMetadata = { [HEADER]: { [key: string]: string } } & { [STATUS]: number }
export declare type Response = void | string | AsyncIterable<Buffer | string> | Buffer | { [key: string]: any }
export declare type InternalResponse = (AsyncIterable<Buffer | string> | Buffer | { [key: string]: any }) & HttpMetadata
export declare type Handler = (context: Context, ...args: any[]) => Response | Promise<Response>
export declare type Next = (context: Context, ...args: any[]) => Promise<InternalResponse>
export declare type Adaptor = (next: Next) => Handler | Promise<Handler>
export declare interface Middleware {
  (...options: [any]): Adaptor
}

export declare class Context {
  public constructor(request: IncomingMessage, response: OutgoingMessage)
  public request: IncomingMessage
  public start: number
  public params: { [key: string]: string }
  public remote: string
  public host: string
  public id: string
  private _parsedUrl?: URL
  private _body?: { [key: string]: string }
  private _accepts?: Accepts
  private _response: OutgoingMessage
  private _routed: any
  private _cookie: Cookie
  public get cookie(): Cookie
  public get session(): Promise<Session>
  public get method(): string
  public get headers(): { [key: string]: string }
  public get url(): URL
  public set url(v: URL)
  public get query(): { [key: string]: string }
  public get body(): Promise<{ [key: string]: string }>
  public get accepts(): Accepts
  {%- if postgres %}
  get postgresClient(): Promise<Client>
  {%- endif -%}
  {%- if redis %}
  get redisClient(): IHandyRedis
  {%- endif -%}
  {%- if honeycomb %}
  get traceURL(): string
  {% endif -%}

  [x: string]: any
}

declare type TestHandler = (t: Test) => Promise<any | void> | any | void

export namespace middleware {
  export const applyXFO: Middleware
  export const handleCORS: Middleware
  export const session: Middleware
  {%- if jwt %}
  export const authenticateJWT: Middleware
  {%- endif -%}
  {%- if templates %}
  export const template: Middleware
  export const templateContext: Middleware
  {%- endif -%}
  {%- if oauth %}
  export const oauth: Middleware
  export const handleOAuthLogin: Middleware
  export const handleOAuthLogout: Middleware
  export const handleOAuthCallback: Middleware
  {%- endif -%}
  {%- if staticfiles %}
  export const staticfiles: Middleware
  {%- endif -%}
  {%- if esbuild %}
  export const esbuild: Middleware
  {%- endif -%}
  {%- if csrf %}
  export const applyCSRF: Middleware
  {%- endif %}

  export namespace validate {
    export const body: Middleware
    export const query: Middleware
    export const params: Middleware
  }

  export function test(options?: {
    middleware?: Middleware[]
    handlers?: { [key: string]: Handler }
    bodyParsers?: BodyParser[]
    after?: (any) => any
  }): (handler: TestHandler) => TestHandler
}

export namespace body {
  export const body: BodyParser
  export const urlEncoded: BodyParser
}

// Decorators are deprecated they export many of the same
// things as 'middleware', but we have legacy code we need to support.
export namespace decorators {
  export namespace validate {
    export const body: Middleware
    export const query: Middleware
    export const params: Middleware
  }

  export function test(options?: {
    middleware?: Middleware[]
    handlers?: { [key: string]: Handler }
    bodyParsers?: BodyParser[]
    after?: (any) => any
  }): (handler: TestHandler) => TestHandler
}

export class Cookie extends Map {
  constructor(values: Iterable<[any, any]>)
  public changed: Set<string>
  private collect(): [string]
  static from(input: string): Cookie
}

export class Session extends Map {
  constructor(id: string, values: Iterable<[any, any]>)
  public reissue(): void
}

export class BadSessionError extends Error {}
