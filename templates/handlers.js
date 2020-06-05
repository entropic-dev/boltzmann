const { Context } = require('./boltzmann.js') // optionally pull in typescript definition

greeting.route = 'GET /hello/:name'
async function greeting(/** @type {Context} */ context) {
  return `hello ${context.params.name}`
}

module.exports = {
  greeting,
}
