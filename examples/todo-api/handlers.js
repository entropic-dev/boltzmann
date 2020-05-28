'use strict'

const { Context } = require('./boltzmann')

module.exports = {
  greet
}

greet.route = 'GET /'
async function greet (/** @type {Context} */ context) {
  return {
    greeting: 'hello world'
  }
}
