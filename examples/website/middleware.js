'use strict'

const boltzmann = require('./boltzmann')

function appMiddleware(/* your config */) {
  return function createMWFunc(next) {
    return async function inner(context) {
      // A real-world example might examine cookies and look up session data.
      context.sitename = 'Boltzmann Example'
      const result = await next(context)
      return result
    }
  }
}

// Route-mounted middlewares follow exactly the same pattern.
function greetingMiddleware(/* your config */) {
  return (next) => {
    return (context) => {
      // You might instead do something with a cookie, or enforce
      // an authorization requirement.
      context.greeting = 'Hello, '
      return next(context)
    }
  }
}

module.exports = {
  greetingMiddleware, // exported for mounting & testing
  appMiddleware, // exported for testing
  APP_MIDDLEWARE: [
    // and this export mounts middlwares on the app
    [
      boltzmann.middleware.applyCSRF,
      {
        cookieSecret: "it's a secret to everybody",
        // cookieSecret: process.env.COOKIE_SECRET,
        // csrfCookie: '_csrf',
        // param: '_csrf',
        // header: 'csrf-token'
      },
    ],
    [
      boltzmann.middleware.template,
      {
        // filters: {}, // add custom template filters
        // tags: {}     // extend nunjucks with custom tags
      },
    ],
    appMiddleware,
  ],
}
