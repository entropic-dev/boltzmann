const { Context } = require('./boltzmann.js') // optionally pull in typescript definition
const mw = require('./middleware')

greeting.route = 'GET /hello/:name'
greeting.middleware = [ mw.greetingMiddleware ]
async function greeting(/** @type {Context} */ context) {
  return {
    [Symbol.for('template')]: 'index.html',
    name: context.params.name,
    greeting: context.greeting // added to our context the EXTREMELY SOPHISTICATED middleware
  }
}

// This route generates an error. Try it!
explode.route = 'GET /explode'
async function explode() {
    kaboom
}

module.exports = {
  greeting,
  explode
}
