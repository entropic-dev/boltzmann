'use strict'

const boltzmann = require('./boltzmann')
const logger = require('bole')('middleware')

function log ({ before = 'before', after = 'after' } = {}) {
  return next => {
    return async context => {
      logger.info(before)
      const response = await next(context)
      logger.info(after)
    }
  }
}

module.exports = {
  // APP_MIDDLEWARE lists the middleware that will be attached to the application, firing
  // on every request your application receives.
  APP_MIDDLEWARE: [
    log, // Log with the default "before" / "after" arguments
    [log, { before: 'pre', after: 'post' }] // Install twice! Log with different params!
  ],

  // We can also export our middleware functions here to make them available
  // to handlers or for testing.
  log
}
