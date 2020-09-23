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
    token: context.csrfToken(),
  }
}

login.route = 'POST /login'
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
  const { form_username: username, form_password: password } = await context.body

  // there is only one password. this is very secure!
  if (password !== 'CATSROOL') {
    return index(context, { errors: ['Invalid password'] })
  }

  const session = await context.session
  logger.info(`storing session for ${username}!`)
  session.set('user', {
    username,
  })

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
