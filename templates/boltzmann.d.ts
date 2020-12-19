declare module "./boltzmann.js";
/// <reference types="node" />
import { IncomingMessage, OutgoingMessage } from "http";
import { URL } from "url";
import { Accepts } from "accepts";
import { Cookie } from "cookie";
{%- if postgres %}
import { Client } from "pg";
{%- endif -%}
{%- if redis %}
import { IHandyRedis } from "handy-redis";
{% endif -%}

const TEMPLATE = Symbol.for('template')
const HEADER = Symbol.for('headers')
const STATUS = Symbol.for('status')

export * from "./boltzmann.js";
export declare type BodyNext         = (readable: IncomingMessage) => Promise<{[key: string]: any}>
export declare type BodyHandler      = (readable: IncomingMessage) => {[key: string]: any} | Promise<{[key: string]: any}>
export declare type BodyParser       = (next: BodyNext) => BodyHandler;
export declare type HttpMetadata     = {[HEADER]: {[key: string]: string}} & {[STATUS]: number};
export declare type Response         = void | string | AsyncIterable<Buffer | string> | Buffer | Object;
export declare type InternalResponse = (AsyncIterable<Buffer | string> | Buffer | Object) & HttpMetadata;
export declare type Handler          = (context: Context, ...args: any[]) => Response | Promise<Response>;
export declare type Next             = (context: Context, ...args: any[]) => Promise<InternalResponse>;
export declare type Adaptor          = (next: Next) => Handler | Promise<Handler>;
export declare interface Middleware {
  (...options?: [any]): Adaptor;
};

export declare class Context {
  public constructor(request: IncomingMessage, response: OutgoingMessage);
  public request: IncomingMessage;
  public start: number;
  public params: {[key: string]: string};
  public remote: string;
  public host: string;
  public id: string;
  private _parsedUrl?: URL;
  private _body?: {[key: string]: string};
  private _accepts?: Accepts;
  private _response: OutgoingMessage;
  private _routed: any;
  private _cookie: Cookie;
  public get cookie(): Cookie;
  public get session(): Promise<Session>;
  public get method(): string;
  public get headers(): {[key: string]: string};
  public get url(): URL;
  public set url(v: string);
  public get query(): {[key: string]: string};
  public get body(): Promise<{[key: string]: string}>;
  public get accepts(): Accepts;
  {%- if postgres %}
  get postgresClient(): Promise<Client>;
  {%- endif -%}
  {%- if redis %}
  get redisClient(): IHandyRedis;
  {%- endif -%}
  {%- if honeycomb %}
  get traceURL(): string;
  {% endif -%}

  [x: string]: any;
};

export namespace middleware {
  declare const applyXFO: Middleware;
  declare const handleCORS: Middleware;
  declare const session: Middleware;
  {%- if jwt %}
  declare const authenticateJWT: Middleware;
  {%- endif -%}
  {%- if templates %}
  declare const template: Middleware;
  declare const templateContext: Middleware;
  {%- endif -%}
  {%- if oauth %}
  declare const oauth: Middleware;
  declare const handleOAuthLogin: Middleware;
  declare const handleOAuthLogout: Middleware;
  declare const handleOAuthCallback: Middleware;
  {%- endif -%}
  {%- if staticfiles %}
  declare const staticfiles: Middleware;
  {%- endif -%}
  {%- if esbuild %}
  declare const esbuild: Middleware;
  {%- endif -%}
  {%- if csrf %}
  declare const applyCSRF: Middleware;
  {%- endif %}

  namespace validate {
    declare const body: Middleware;
    declare const query: Middleware;
    declare const params: Middleware;
  }
  declare const test: Middleware;
}

export namespace body {
  declare const body: BodyParser;
  declare const urlEncoded: BodyParser;
}

export namespace decorators {
  namespace validate {
    declare const body: Middleware;
    declare const query: Middleware;
    declare const params: Middleware;
  }
  declare const test: Middleware;
}

export class Cookie extends Map {
  constructor(values: Iterable<[any, any]>);
  public changed: Set<string>;
  private collect(): [string];
  static from(string): Cookie;
}

export class Session extends Map {
  constructor(id: string, values: Iterable<[any, any]>);
  public reissue(): void;
}

export class BadSessionError extends Error implements Response {
};
