'use strict'

// {% if esm %}
import { middleware } from './boltzmann.js'
// {% else %}
const boltzmann = require('./boltzmann')
// {% endif %}

// All Boltzmann middleware looks like this.
// Middleware can be attached to either the app or individual routes.
{% if esm %}export{% endif %} function setupMiddlewareFunc(/* your config */) {
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
{% if esm %}export{% endif %} function routeMiddlewareFunc(/* your config */) {
  return (next) => {
    return (context) => {
      return next(context)
    }
  }
}

// {% if esm %}
// This export is special: it instructs Boltzmann to attach
// middlewares to the app in this order.
// This is also where you can configure built-in middleware.
export const APP_MIDDLEWARE = [
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
  [middleware.template, {
    // filters: {}, // add custom template filters
    // tags: {}     // extend nunjucks with custom tags
  }]
  {%- endif %}
]
// {% else %}
module.exports = {
  // You can export middleware for testing or for attaching to routes.
  routeMiddlewareFunc,
  setupMiddlewareFunc,
  APP_MIDDLEWARE: [
    // This export is special: it instructs Boltzmann to attach middlewares to the app in this
    // order. This is also where you can configure built-in middleware.
    setupMiddlewareFunc,
    // [boltzmann.middleware.applyXFO, 'SAMEORIGIN'], // Must be one of DENY or SAMEORIGIN; uncomment to enable
    {%- if jwt %}
    /* Provide a path to a file containing your public key & uncomment to enable
    [boltzmann.middleware.authenticateJWT, {
      // scheme: 'Bearer',      // Default; uncomment & edit to use another value.
      // publicKey: process.env.AUTHENTICATION_KEY, // Set env var OR this key to path to a file containing a key
      // algorithms: ['RS256'], // Default; uncomment & edit to use another value.
      // storeAs: 'user'        // Default; uncomment & edit to use another value.
    }],
    */
    {%- endif %}
    {%- if csrf %}
    /* Provide a cookie secret & uncomment to enable.
    [boltzmann.middleware.applyCSRF, {
      // cookieSecret: process.env.COOKIE_SECRET, //  Set the env var to change.
      // csrfCookie: '_csrf',  // Default; uncomment & edit to use another value.
      // param: '_csrf',       // Default; uncomment & edit to use another value.
      // header: 'csrf-token'  // Default; uncomment & edit to use another value.
    }],
    */
    {%- endif %}
    {%- if templates %}
    [boltzmann.middleware.template, {
      // paths: ['templates'], // change template file locations
      // filters: {}, // add custom template filters
      // tags: {}     // extend nunjucks with custom tags
    }],
    {%- endif %}
  ],
}
// {% endif %}
