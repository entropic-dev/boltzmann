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

void `{% if honeycomb %}`;
import beeline from 'honeycomb-beeline'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { AlwaysOnSampler, AlwaysOffSampler, ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/core'
import { SimpleSpanProcessor, SpanProcessor } from '@opentelemetry/sdk-trace-base'
import { Metadata, credentials } from '@grpc/grpc-js'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { Resource } from '@opentelemetry/resources'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { Sampler, context as otelContext, propagation as otelPropagation, trace as otelTrace, Tracer as OtelTracer} from '@opentelemetry/api'
import { DnsInstrumentation } from '@opentelemetry/instrumentation-dns'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { GrpcInstrumentation } from '@opentelemetry/instrumentation-grpc'
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis'
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
import { MongoDBInstrumentation } from '@opentelemetry/instrumentation-mongodb'
import { MySQLInstrumentation } from '@opentelemetry/instrumentation-mysql'

if (!process.env.HONEYCOMB_DATASET && process.env.HONEYCOMBIO_DATASET) {
  process.env.HONEYCOMB_DATASET = process.env.HONEYCOMBIO_DATASET
}

if (!process.env.HONEYCOMB_WRITEKEY && process.env.HONEYCOMBIO_WRITEKEY) {
  process.env.HONEYCOMB_WRITEKEY = process.env.HONEYCOMBIO_WRITEKEY
}

if (!process.env.HONEYCOMB_SAMPLE_RATE && process.env.HONEYCOMBIO_SAMPLE_RATE) {
  process.env.HONEYCOMB_SAMPLE_RATE = process.env.HONEYCOMBIO_SAMPLE_RATE
}

if (!process.env.HONEYCOMB_TEAM && process.env.HONEYCOMBIO_TEAM) {
  process.env.HONEYCOMB_TEAM = process.env.HONEYCOMBIO_TEAM
}

if (!process.env.HONEYCOMB_DATASET && process.env.HONEYCOMBIO_DATASET) {
  process.env.HONEYCOMB_DATASET = process.env.HONEYCOMBIO_DATASET
}

let sdk: NodeSDK | null = null

function isHoneycomb (env: typeof process.env): boolean {
  return !!env.HONEYCOMB_WRITEKEY
}

function isOtel (env: typeof process.env): boolean {
  if (isHoneycomb(env) && env.HONEYCOMB_API_HOST) {
    return /^grpc:\/\//.test(env.HONEYCOMB_API_HOST)
  }
  return false
}

if (isOtel(process.env)) {
  const metadata = new Metadata()
  metadata.set('x-honeycomb-team', <string>process.env.HONEYCOMB_WRITE_KEY)
  metadata.set('x-honeycomb-dataset', <string>process.env.HONEYCOMB_DATASET)

  const sampleRate: number = Number(process.env.HONEYCOMB_SAMPLE_RATE || 1)

  let sampler: Sampler = new AlwaysOnSampler()

  if (sampleRate === 0) {
    sampler = new AlwaysOffSampler()
  } else if (sampleRate !== 1) {
    sampler = new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(sampleRate)
    })
  }

  const tracerProvider = new NodeTracerProvider({ sampler })

  const traceExporter = new OTLPTraceExporter({
    url: process.env.HONEYCOMB_API_HOST,
    credentials: credentials.createSsl(),
    metadata
  })

  // There's a bug in the types here - SimpleSpanProcessor doesn't
  // take the optional Context argument in its signature and
  // typescript is understandably cranky about that.
  const spanProcessor: SpanProcessor = <SpanProcessor>(
    new SimpleSpanProcessor(traceExporter) as unknown
  )
  tracerProvider.addSpanProcessor(spanProcessor)
  tracerProvider.register()

  sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName
    }),
    traceExporter,
    instrumentations: [
      new DnsInstrumentation({}),
      new HttpInstrumentation({}),
      new GrpcInstrumentation({}),
      new IORedisInstrumentation({}),
      new RedisInstrumentation({}),
      new PgInstrumentation({}),
      new MongoDBInstrumentation({}),
      new MySQLInstrumentation({})
    ]
  })
} else if (isHoneycomb(process.env)) {
  beeline({
    writeKey: process.env.HONEYCOMB_WRITEKEY,
    dataset: process.env.HONEYCOMB_DATASET,
    sampleRate: Number(process.env.HONEYCOMB_SAMPLE_RATE) || 1,
    serviceName,
  })
}

function initOtelSDK(): Promise<void> {
  if (sdk) {
    let exitCode = 0
    process.once('SIGTERM', shutdown)
    process.once('beforeExit', shutdown)
    process.once('uncaughtException', die)
    process.once('unhandledRejection', die)
    return sdk.start()

    async function die(err: Error) {
      console.error(err.stack)
      exitCode = 1
      await shutdown()
    }

    async function shutdown() {
      if (sdk) {
        try {
          await sdk.shutdown()
        } catch (err) {
          console.error(err.stack)
        }
      }
      process.exit(exitCode)
    }
  }
  return Promise.resolve()
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
import assert from 'assert'
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

// void `{% if selftest %}`
import tap from 'tap'
// void `{% else %}`
// import type tap from 'tap'
// void `{% endif %}`

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
export { onHeaders, initOtelSDK }
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
  otelContext,
  otelPropagation,
  otelTrace,
  OtelTracer,
}
void `{% endif %}`
