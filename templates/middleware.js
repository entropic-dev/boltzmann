'use strict'

const boltzmann = require('./boltzmann')

// Your app-mounted middlewares look like this.
function setupMiddlewareFunc(/* your config */) {
  // startup configuration goes here
  return function createMiddlewareFunc(next) {
    return async function inner(context) {
      // do things like make objects to put on the context
      // then give following middlewares a chance
      // route handler runs last
      // awaiting is optional, depending on what you're doing
      const result = await next(context)
      // do things with result here; can replace it entirely!
      // and you're responsible for returning it
      return result
    }
  }
}

// Route-mounted middlewares follow exactly the same pattern.
function routeMiddlewareFunc(/* your config */) {
  return next => {
    return context => {
      return next(context)
    }
  }
}

module.exports = {
  routeMiddlewareFunc, // exported for mounting & testing
  setupMiddlewareFunc, // exported for testing
  APP_MIDDLEWARE: [    // and this export mounts middlwares on the app
    setupMiddlewareFunc,
    {%- if csrf %}
    [boltzmann.middleware.applyCSRF, {
      // cookieSecret: process.env.COOKIE_SECRET,
      // csrfCookie: '_csrf',
      // param: '_csrf',
      // header: 'csrf-token'
    }],
    {%- endif %}
    {%- if templates %}
    [boltzmann.middleware.template, {
      // filters: {}, // add custom template filters
      // tags: {}     // extend nunjucks with custom tags
    }]
    {%- endif %}
  ]
}
