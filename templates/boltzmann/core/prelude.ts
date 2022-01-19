'use strict'
// Boltzmann v{{ version }}
/*{#
Hi, dear reader! You're probably here because you want to add some
imports. That's great! Here's an admonition:

!!! This file is transpiled into JS a bit differently than the rest !!!

See bin/buildjs.sh for the details, but TL;DR: we transpile from TS to
JS, then regex replace the ESM import syntax for CommonJS import syntax.
Here's what you need to know:

- Anything you import, you _must_ export in the selftest {if} block at the 
  end of the function. Otherwise, Typescript may _remove_ the import entirely
  from the JS build which BREAKS STUFF.
- Anytime you use typescript-specific syntax, you may wish to use "void `<template directive>;`"
  instead of comment-based template directives. Typescript is very finicky about
  eliminating comments around syntax it actively edits!
#}*/

const serviceName = _getServiceName()

function _getServiceName() {
  try {
    return process.env.SERVICE_NAME || require('./package.json').name.split('/').pop()
  } catch {
    return 'boltzmann'
  }
}

import assert from 'assert'

void `{% if honeycomb %}`;
import beeline from 'honeycomb-beeline'
import { Metadata, credentials } from '@grpc/grpc-js'
import {
  context as otelContext,
  defaultTextMapGetter,
  defaultTextMapSetter,
  propagation as otelPropagation,
  ROOT_CONTEXT,
  Sampler,
  trace as otelTrace,
  Tracer as OtelTracer,
} from '@opentelemetry/api'
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  W3CTraceContextPropagator
} from '@opentelemetry/core'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'
import { Resource } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { SimpleSpanProcessor, SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { SemanticAttributes, SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'

// TODO: right now we install only instrumentation which
// covers node core, redis and postgres. there's both a
// question here of a) which instrumentations get loaded; and
// b) whether this should be more configurable than boltzmann's
// feature flags currently allow.
//
// some relevant instrumentations to consider:
//
// * @opentelemetry/instrumentation-grpc
// * @opentelemetry/instrumentation-graphql
// * some third-party instrumentation for undici
import { Instrumentation } from '@opentelemetry/instrumentation'
import { DnsInstrumentation } from '@opentelemetry/instrumentation-dns'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'

void `{% if redis %}`;
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis'
void `{% endif %}`

void `{% if postgres %}`
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
void `{% endif % }`

function normalizeHoneycombEnvVars (env: typeof process.env): void {
  if (!env.HONEYCOMB_DATASET && env.HONEYCOMBIO_DATASET) {
    env.HONEYCOMB_DATASET = env.HONEYCOMBIO_DATASET
  }

  if (!env.HONEYCOMB_WRITEKEY && env.HONEYCOMBIO_WRITEKEY) {
    env.HONEYCOMB_WRITEKEY = process.env.HONEYCOMBIO_WRITEKEY
  }

  if (!env.HONEYCOMB_SAMPLE_RATE && env.HONEYCOMBIO_SAMPLE_RATE) {
    env.HONEYCOMB_SAMPLE_RATE = env.HONEYCOMBIO_SAMPLE_RATE
  }

  if (!env.HONEYCOMB_TEAM && env.HONEYCOMBIO_TEAM) {
    env.HONEYCOMB_TEAM = env.HONEYCOMBIO_TEAM
  }

  if (!env.HONEYCOMB_DATASET && env.HONEYCOMBIO_DATASET) {
    env.HONEYCOMB_DATASET = env.HONEYCOMBIO_DATASET
  }
}

function isHoneycomb (env: typeof process.env): boolean {
  return !!env.HONEYCOMB_WRITEKEY
}

function isOtel (env: typeof process.env): boolean {
  if (isHoneycomb(env) && env.HONEYCOMB_API_HOST) {
    return /^grpc:\/\//.test(env.HONEYCOMB_API_HOST)
  }
  return false
}

function getHoneycombSampleRate (env: typeof process.env): number {
  return Number(env.HONEYCOMB_SAMPLE_RATE || 1)
}

function getOtelApiHost (env: typeof process.env): string {
  assert(typeof env.HONEYCOMB_API_HOST === 'string')
  return env.HONEYCOMB_API_HOST as string
}

function createOtelMetadata (env: typeof process.env): Metadata {
  const metadata = new Metadata()

  assert(typeof env.HONEYCOMB_WRITE_KEY === 'string' && typeof env.HONEYCOMB_DATASET === 'string')

  metadata.set('x-honeycomb-team', <string>env.HONEYCOMB_WRITE_KEY)
  metadata.set('x-honeycomb-dataset', <string>env.HONEYCOMB_DATASET)
  return metadata
}

function createOtelSampler (sampleRate: number): Sampler {
  let sampler: Sampler = new AlwaysOnSampler()

  if (sampleRate === 0) {
    sampler = new AlwaysOffSampler()
  } else if (sampleRate !== 1) {
    sampler = new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(sampleRate)
    })
  }

  return sampler
}

function createOtelTracerProvider (sampler: Sampler): NodeTracerProvider {
  return new NodeTracerProvider({ sampler })
}

function createOtelTraceExporter (url: string, metadata: Metadata): OTLPTraceExporter {
  return new OTLPTraceExporter({
    url,
    credentials: credentials.createSsl(),
    metadata
  })
}

function registerOtelSpanProcessorWithProvider (processor: SpanProcessor, provider: NodeTracerProvider): void {
  provider.addSpanProcessor(processor)
  // TODO: do I need this?
  // provider.register()
}

function createOtelSpanProcessor (traceExporter: OTLPTraceExporter): SpanProcessor {
  // There's a bug in the types here - SimpleSpanProcessor doesn't
  // take the optional Context argument in its signature and
  // typescript is understandably cranky about that.
  return <SpanProcessor>(new SimpleSpanProcessor(traceExporter) as unknown)
}

let otelSdk: NodeSDK | null = null

function initOtelSdk (serviceName: string, traceExporter: OTLPTraceExporter): void {
  let instrumentations: Instrumentation[] = [
    new DnsInstrumentation({}),
    new HttpInstrumentation({}),
  ]

  void `{% if redis %}`
  instrumentations.push(new RedisInstrumentation({}))
  void `{% endif %}`

  void `{% if postgres %}`
  instrumentations.push(new PgInstrumentation({}))
  void `{% endif %}`

  otelSdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName
    }),
    traceExporter,
    instrumentations
  })
}

function initOtel (): void {
  const url: string = getOtelApiHost(process.env)
  const sampleRate: number = getHoneycombSampleRate(process.env)
  const metadata: Metadata = createOtelMetadata(process.env)

  const sampler: Sampler = createOtelSampler(sampleRate)
  const provider: NodeTracerProvider = createOtelTracerProvider(sampler)

  const exporter = createOtelTraceExporter(url, metadata)

  const processor = createOtelSpanProcessor(exporter)

  registerOtelSpanProcessorWithProvider(processor, provider)

  initOtelSdk(serviceName, exporter)
}

function startOtelSdk(): Promise<void> {
  let exitCode = 0

  async function die(err: Error) {
    console.error(err.stack)
    exitCode = 1
    await shutdown()
  }

  async function shutdown() {
    if (otelSdk) {
      try {
        await otelSdk.shutdown()
      } catch (err) {
        console.error(err.stack)
      }
    }
    process.exit(exitCode)
  }

  if (otelSdk) {
    process.once('SIGTERM', shutdown)
    process.once('beforeExit', shutdown)
    process.once('uncaughtException', die)
    process.once('unhandledRejection', die)
    return otelSdk.start()
  }

  return Promise.resolve()
}

function initBeeline () {
  beeline({
    writeKey: process.env.HONEYCOMB_WRITEKEY,
    dataset: process.env.HONEYCOMB_DATASET,
    sampleRate: Number(process.env.HONEYCOMB_SAMPLE_RATE) || 1,
    serviceName,
  })
}

// launch salvos
normalizeHoneycombEnvVars(process.env)

if (isOtel(process.env)) {
  initOtel()
} else if (isHoneycomb(process.env)) {
  initBeeline()
}

import onHeaders from 'on-headers'
void `{% endif %}`;

import ships from 'culture-ships'
void `{% if ping %}`;
const ship = ships.random()
void `{% endif %}`;

import { IncomingMessage, ServerResponse } from 'http'
import { URL } from 'url'
import * as uuid from 'uuid'
import { seal, unseal, defaults as ironDefaults } from '@hapi/iron'
import { Accepts } from 'accepts'
import { RouteOptions, Handler as FMWHandler, HTTPVersion, HTTPMethod } from 'find-my-way'
import Ajv from 'ajv'
import * as cookie from 'cookie'
void `{% if redis %}`;
import { WrappedNodeRedisClient } from 'handy-redis'
void `{% endif %}`;

void `{% if postgres %}`;
import {
  Client as PGClient,
  PoolClient as PGPoolClient,
  Pool as PGPool,
} from 'pg'
void `{% endif %}`;

void `{% if templates %}`;
import { ConfigureOptions, Extension } from 'nunjucks'
void `{% endif %}`;

void `{% if jwt or oauth %}`;
import { Algorithm, verify as verifyJWT, decode as decodeJWT } from 'jsonwebtoken'
void `{% endif %}`;

void `{% if csrf %}`;
import CsrfTokens from 'csrf'
void `{% endif %}`;

void `{% if esbuild %}`;
import { build } from 'esbuild'
void `{% endif %}`;

void `{% if esbuild or staticfiles %}`;
import mime from 'mime'
void `{% endif %}`;
void `{% if oauth %}`;
import { OAuth2 } from 'oauth'
void `{% endif %}`;

import { Readable } from 'stream'

import type { RequestOptions as ShotRequestOptions, Listener, ResponseObject } from '@hapi/shot'

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
void `{% if redis %}`;
import * as redis from 'handy-redis'
void `{% endif %}`;
void `{% if postgres %}`;
import pg from 'pg'
void `{% endif %}`;

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

void `{% if selftest %}`;
import tap from 'tap'
import { Test } from '../middleware/test'

/* c8 ignore next */
if (require.main === module) {
  const { test } = tap

  test('isHoneycomb detects if Honeycomb is enabled', async (assert: Test) => {
    assert.equal(isHoneycomb({}), false)
    assert.equal(isHoneycomb({HONEYCOMB_WRITEKEY: ''}), false)
    assert.equal(isHoneycomb({HONEYCOMB_WRITEKEY: 'some write key'}), true)
  })

  test('isOtel detects if OpenTelemetry is enabled', async (assert: Test) => {
    assert.equal(isOtel({}), false)
    assert.equal(isOtel({HONEYCOMB_WRITEKEY: ''}), false)
    assert.equal(isOtel({HONEYCOMB_WRITEKEY: 'some write key'}), false)
    assert.equal(isOtel({
      HONEYCOMB_WRITEKEY: 'some write key',
      HONEYCOMB_API_HOST: 'https://refinery.website'
    }), false)
    assert.equal(isOtel({
      HONEYCOMB_WRITEKEY: 'some write key',
      HONEYCOMB_API_HOST: 'grpc://otel.website'
    }), true)
    assert.equal(isOtel({
      HONEYCOMB_WRITEKEY: '',
      HONEYCOMB_API_HOST: 'grpc://otel.website'
    }), false)
  })
}

void `{% if postgres %}`;
export { pg, PGPool, PGPoolClient, PGClient }
void `{% endif %}`;

void `{% if redis %}`;
export { redis }
void `{% endif %}`;

void `{% if honeycomb %}`;
export {
  AlwaysOffSampler,
  AlwaysOnSampler,
  defaultTextMapGetter,
  defaultTextMapSetter,
  DnsInstrumentation,
  HttpInstrumentation,
  startOtelSdk,
  NodeSDK,
  NodeTracerProvider,
  onHeaders,
  otelContext,
  otelPropagation,
  otelTrace,
  OtelTracer,
  OTLPTraceExporter,
  ParentBasedSampler,
  Resource,
  ROOT_CONTEXT,
  Sampler,
  SemanticAttributes,
  SemanticResourceAttributes,
  SimpleSpanProcessor,
  SpanProcessor,
  TraceIdRatioBasedSampler,
  W3CTraceContextPropagator
}

void `{% if postgres %}`
export {
  PgInstrumentation
}
void `{% endif %}`;

void `{% if redis %}`
export {
  RedisInstrumentation
}
void `{% endif %}`;



void `{% endif %}`;

void `{% if jwt or oauth %}`;
export { verifyJWT, decodeJWT }
void `{% endif %}`;

void `{% if csrf %}`;
export { CsrfTokens }
void `{% endif %}`;

void `{% if esbuild %}`;
export { build }
void `{% endif %}`;

void `{% if esbuild or staticfiles %}`;
export { mime }
void `{% endif %}`;
void `{% if oauth %}`;
export { OAuth2 }
void `{% endif %}`;
export { Readable }

export {
  assert,
  serviceName,
  ship,
  THREW,
  STATUS,
  REISSUE,
  HEADERS,
  TEMPLATE,
  HttpMetadata,
  IncomingMessage,
  ServerResponse,
  URL,
  uuid,
  seal,
  unseal,
  ironDefaults,
  Accepts,
  RouteOptions,
  FMWHandler,
  HTTPVersion,
  HTTPMethod,
  Ajv,
  ShotRequestOptions,
  Listener,
  ResponseObject,
  cookie,
  os,
  path,
  bole,
  http,
  crypto,
  fs,
  accepts,
  fmw,
  isDev,
  promisify,
  querystring,
  ships,
  beeline,
  isHoneycomb,
  isOtel,
}
void `{% endif %}`
