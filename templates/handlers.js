const { Context } = require('./boltzmann.js') // optionally pull in typescript definition

greeting.route = 'GET /hello/:name'
// {% if templates %}
async function greeting(/** @type {Context} */ context) {
  return {
    [Symbol.for('template')]: 'index.html',
    name: context.params.name,
  }
}
// {% else %}
async function greeting(/** @type {Context} */ context) {
  return `hello ${context.params.name}`
}
// {% endif %}

module.exports = {
  greeting,
}
