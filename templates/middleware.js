'use strict'

const boltzmann = require('./boltzmann')

// All Boltzmann middleware looks like this.
// Middleware can be attached to either the app or individual routes.
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

// Here's a more compactly-defined middleware.
function routeMiddlewareFunc(/* your config */) {
  return next => {
    return context => {
      return next(context)
    }
  }
}

module.exports = {
  // You can export middleware for testing or for
  // attaching to routes.
  routeMiddlewareFunc,
  setupMiddlewareFunc,
  APP_MIDDLEWARE: [
    // This export is special: it instructs Boltzmann to attach
    // middlewares to the app in this order.
    // This is also where you can configure built-in middleware.
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
