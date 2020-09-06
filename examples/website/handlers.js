const { Context } = require('./boltzmann.js') // optionally pull in typescript definition
const mw = require('./middleware')
const logger = require('bole')('example')

greeting.route = 'GET /:name'
greeting.middleware = [mw.greetingMiddleware]
async function greeting(/** @type {Context} */ context) {
  logger.info(`about to greet ${context.params.name}`)
  return {
    [Symbol.for('template')]: 'index.html',
    name: context.params.name,
    greeting: context.greeting, // added to our context by the EXTREMELY SOPHISTICATED middleware
  }
}

// This route generates an error. Try it!
explode.route = 'GET /explode'
async function explode() {
  kaboom
}

module.exports = {
  explode,
  greeting,
}
