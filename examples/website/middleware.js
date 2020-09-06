'use strict'

const boltzmann = require('./boltzmann')

// All Boltzmann middleware looks like this.
// Middleware can be attached to either the app or individual routes.
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

// Here's a more compactly-defined middleware.
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
  // You can export middleware for testing or for
  // attaching to routes.
  greetingMiddleware,
  appMiddleware,
  APP_MIDDLEWARE: [
    // This export is special: it instructs Boltzmann to attach
    // middlewares to the app in this order.
    // This is also where you can configure built-in middleware.
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
