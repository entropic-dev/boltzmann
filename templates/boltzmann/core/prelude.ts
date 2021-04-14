'use strict'
// Boltzmann v{{ version }}

/* {% if selftest %} */export /* {% endif %} */const serviceName = _getServiceName()

function _getServiceName () {
  try {
    return process.env.SERVICE_NAME ||
    require('./package.json').name.split('/').pop()
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
  serviceName
})

import onHeaders from 'on-headers'
// {% endif %}

import ships from 'culture-ships'
// {% if ping %}
/* {% if selftest %} */export /* {% endif %} */const ship = ships.random()
// {% endif %}

import querystring from 'querystring'
import {promisify} from 'util'
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
import redis from 'handy-redis'
// {% endif %}
// {% if postgres %}
import pg from 'pg'
// {% endif %}

/* {% if selftest %} */export /* {% endif %} */const THREW = Symbol.for('threw')
/* {% if selftest %} */export /* {% endif %} */const STATUS = Symbol.for('status')
/* {% if selftest %} */export /* {% endif %} */const REISSUE = Symbol.for('reissue')
/* {% if selftest %} */export /* {% endif %} */const HEADERS = Symbol.for('headers')
/* {% if selftest %} */export /* {% endif %} */const TEMPLATE = Symbol.for('template')

// {% if selftest %}
export {
// {% if postgres %}
  pg,
// {% endif %}
// {% if redis %}
  redis,
// {% endif %}
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
// {% if honeycomb %}
  onHeaders,
  beeline,
// {% endif %}
}
// {% endif %}
