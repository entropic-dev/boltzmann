'use strict'
// Boltzmann v{{ version }}
/*{% comment %}
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
{% endcomment %}*/

const serviceName = _getServiceName()

function _getServiceName() {
  try {
    return process.env.SERVICE_NAME || require('./package.json').name.split('/').pop()
  } catch {
    return 'boltzmann'
  }
}

// {% if honeycomb %}
import beeline from 'honeycomb-beeline'

beeline({
  writeKey: process.env.HONEYCOMBIO_WRITE_KEY,
  dataset: process.env.HONEYCOMBIO_DATASET,
  sampleRate: Number(process.env.HONEYCOMBIO_SAMPLE_RATE) || Number(process.env.HONEYCOMB_SAMPLE_RATE) || 1,
  serviceName,
})

import onHeaders from 'on-headers'
// {% endif %}

import ships from 'culture-ships'
// {% if ping %}
const ship = ships.random()
// {% endif %}

import { IncomingMessage, ServerResponse } from 'http'
import { URL } from 'url'
import * as uuid from 'uuid'
import { seal, unseal, defaults as ironDefaults } from '@hapi/iron'
import { Accepts } from 'accepts'
import { RouteOptions, Handler as FMWHandler, HTTPVersion, HTTPMethod } from 'find-my-way'
import Ajv from 'ajv'
import assert from 'assert'
import * as cookie from 'cookie'
/* {% if redis %} */ import { IHandyRedis } from 'handy-redis' /* {% endif %} */
/* {% if postgres %} */ import {
  Client as PGClient,
  PoolClient as PGPoolClient,
  Pool as PGPool,
} from 'pg' /* {% endif %} */
/* {% if templates %} */ import { ConfigureOptions, Extension } from 'nunjucks' /* {% endif %} */
// {% if jwt or oauth %}
import { Algorithm, verify as verifyJWT, decode as decodeJWT } from 'jsonwebtoken'
// {% endif %}

// {% if csrf %}
import CsrfTokens from 'csrf'
// {% endif %}

// {% if esbuild %}
import { build } from 'esbuild'
// {% endif %}

// {% if esbuild or staticfiles %}
import mime from 'mime'
// {% endif %}
// {% if oauth %}
import { OAuth2 } from 'oauth'
// {% endif %}

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
// {% if redis %}
import * as redis from 'handy-redis'
// {% endif %}
// {% if postgres %}
import pg from 'pg'
// {% endif %}

const THREW = Symbol.for('threw')
const STATUS = Symbol.for('status')
const REISSUE = Symbol.for('reissue')
const HEADERS = Symbol.for('headers')
const TEMPLATE = Symbol.for('template')

void `{% if selftest %}`

// {% if postgres %}
export { pg }
// {% endif %}

// {% if redis %}
export { redis }
// {% endif %}

// {% if honeycomb %}
export { onHeaders, beeline }
// {% endif %}

// {% if jwt or oauth %}
export { verifyJWT, decodeJWT }
// {% endif %}

// {% if csrf %}
export { CsrfTokens }
// {% endif %}

// {% if esbuild %}
export { build }
// {% endif %}

// {% if esbuild or staticfiles %}
export { mime }
// {% endif %}
// {% if oauth %}
export { OAuth2 }
// {% endif %}
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
}
void `{% endif %}`
