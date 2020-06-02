'use strict'

const attachClient = require('./attach-client')
const attachFlappingClient = require('./attach-flapping-client')
const gzip = require('./gzip')

module.exports = [
  [attachClient, { url: process.env.SEARCH_URL || 'https://api.duckduckgo.com/' }],
  attachFlappingClient,
  gzip
]
