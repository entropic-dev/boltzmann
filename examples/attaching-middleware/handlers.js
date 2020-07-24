'use strict'

const { Context } = require('./boltzmann.js') // optionally pull in typescript definition
const { log } = require('./middleware')

base.route = 'GET /'
async function base(/** @type {Context} */ _context) {
  return 'ok!'
}

greeting.route = 'GET /hello/:name'
// This middleware will only fire when the application receives a request
// for this route.
greeting.middleware = [
  log, // use the default params,
  [log, { before: 'hello', after: 'goodbye' }], // or customize!
]
async function greeting(/** @type {Context} */ context) {
  return `hello ${context.params.name}`
}

module.exports = {
  base,
  greeting,
}
