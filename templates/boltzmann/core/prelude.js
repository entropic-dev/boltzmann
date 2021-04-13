'use strict'
// Boltzmann v{{ version }}

/* {% if selftest %} */export /* {% endif %} */const serviceName = (
  process.env.SERVICE_NAME ||
  require('./package.json').name.split('/').pop()
)

// {% if honeycomb %}
const beeline = require('honeycomb-beeline')({
  writeKey: process.env.HONEYCOMBIO_WRITE_KEY,
  dataset: process.env.HONEYCOMBIO_DATASET,
  sampleRate: Number(process.env.HONEYCOMBIO_SAMPLE_RATE) || Number(process.env.HONEYCOMB_SAMPLE_RATE) || 1,
  serviceName
})
const onHeaders = require('on-headers')
// {% endif %}

const ships = require('culture-ships')
// {% if ping %}
const ship = ships.random()
// {% endif %}
const querystring = require('querystring')
const { promisify } = require('util')
const isDev = require('are-we-dev')
const fmw = require('find-my-way')
const accepts = require('accepts')
const fs = require('fs').promises
const crypto = require('crypto')
const http = require('http')
const bole = require('@entropic/bole')
const path = require('path')
const os = require('os')
// {% if redis %}
const redis = require('handy-redis')
// {% endif %}
// {% if postgres %}
const pg = require('pg')
// {% endif %}

const THREW = Symbol.for('threw')
const STATUS = Symbol.for('status')
const REISSUE = Symbol.for('reissue')
const HEADERS = Symbol.for('headers')
const TEMPLATE = Symbol.for('template')


