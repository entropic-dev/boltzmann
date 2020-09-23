'use strict'

const {
  Context,
  decorators: { validate },
} = require('./boltzmann.js')
const logger = require('bole')('sessions')

index.route = 'GET /'
async function index(/** @type {Context} */ context, { errors } = {}) {
  return {
    [Symbol.for('template')]: 'index.html',
    errors,
    // Here we generate and use a random token to protect against
    // cross-site request forgery. The middleware will set a cookie for
    // us and we'll compare to the value that gets submitted with the form.
    token: context.csrfToken(),
  }
}

login.route = 'POST /login'
// Here's an example of validating user input in a body.
// The csrf protection middleware will take care of looking
// for a _csrf parameter for us.
login.decorators = [
  validate.body({
    type: 'object',
    required: ['form_password', 'form_username'],
    properties: {
      form_password: { type: 'string' },
      form_username: { type: 'string' },
    },
  }),
]
async function login(/** @type {Context} */ context) {
  // We await the body because we want to make sure we've read all of it.
  const { form_username: username, form_password: password } = await context.body

  // There is only one password. This is very secure!
  if (password !== 'CATSROOL') {
    return index(context, { errors: ['Invalid password'] })
  }

  // Loading the session requires I/O to redis, so it's async.
  const session = await context.session
  logger.info(`storing session for ${username}!`)
  // Using the session object once we have it is synchronous.
  session.set('user', {
    username,
  })

  // Now we respond to the browser with a redirect.
  return {
    [Symbol.for('status')]: 301,
    [Symbol.for('headers')]: {
      location: '/',
    },
  }
}

logout.route = 'POST /logout'
async function logout(/** @type {Context} */ context) {
  const session = await context.session
  session.delete('user')

  return {
    [Symbol.for('status')]: 301,
    [Symbol.for('headers')]: {
      location: '/',
    },
  }
}

module.exports = {
  index,
  login,
  logout,
}
