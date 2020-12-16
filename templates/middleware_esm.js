import { middleware } from './boltzmann.js'

// All Boltzmann middleware looks like this.
// Middleware can be attached to either the app or individual routes.
export function setupMiddlewareFunc(/* your config */) {
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
export function routeMiddlewareFunc(/* your config */) {
  return (next) => {
    return (context) => {
      return next(context)
    }
  }
}

// This export is special: it instructs Boltzmann to attach
// middlewares to the app in this order.
// This is also where you can configure built-in middleware.
export const APP_MIDDLEWARE = [
  setupMiddlewareFunc,
  {%- if jwt %}
  /* Provide a path to a file containing your public key & uncomment to enable
  [middleware.authenticateJWT, {
    // scheme: 'Bearer',      // Default; uncomment & edit to use another value.
    // publicKey: process.env.AUTHENTICATION_KEY, // Set env var OR this key to path to a file containing a key
    // algorithms: ['RS256'], // Default; uncomment & edit to use another value.
    // storeAs: 'user'        // Default; uncomment & edit to use another value.
  }],
  */
  {%- endif %}
  {%- if csrf %}
  /* Provide a cookie secret & uncomment to enable.
  [middleware.applyCSRF, {
    // cookieSecret: process.env.COOKIE_SECRET, //  Set the env var to change.
    // csrfCookie: '_csrf',  // Default; uncomment & edit to use another value.
    // param: '_csrf',       // Default; uncomment & edit to use another value.
    // header: 'csrf-token'  // Default; uncomment & edit to use another value.
  }],
  */
  {%- endif %}
  {%- if templates %}
  [middleware.applyXFO, 'SAMEORIGIN'], // Must be one of DENY or SAMEORIGIN
  [middleware.template, {
    // paths: ['templates'], // change template file locations
    // filters: {}, // add custom template filters
    // tags: {}     // extend nunjucks with custom tags
  }],
  {%- endif %}
  {%- if staticfiles %}
  [middleware.staticfiles, {
    // prefix: 'static', // the URL at which to serve files
    // dir: 'static', // the directory from which to serve static assets (relative to boltzmann.js)
    // addToContext: true, // controls whether STATIC_URL will be set in template context
  }],
  {%- endif %}
  {%- if oauth %}
  [middleware.session, {
    secret: process.env.SESSION_SECRET || 'a very secure secret set surreptitiously'.repeat(5),
    salt: process.env.SESSION_SALT || 'fifteen pounds of salt',
    cookieOptions: {
     sameSite: 'lax' // required because of oauth
    }
  }],
  {%- else %}
  // [middleware.session, {
  // secret: process.env.SESSION_SECRET || 'a very secure secret set surreptitiously'.repeat(5),
  // salt: process.env.SESSION_SALT || 'fifteen pounds of salt',
  // cookieOptions: {}
  // }],
  {%- endif %}
  {%- if oauth %}
  [middleware.oauth, {
    secret: process.env.OAUTH_CLIENT_SECRET,
    clientId: process.env.OAUTH_CLIENT_ID,
    // callbackOptions: {
    //   path: '/callback',
    //   callbackUrl: process.env.OAUTH_CALLBACK_URL,
    // },
    // loginOptions: {},
    // logoutOptions: {},
    // userKey: 'user' // the key to delete from session storage on logout; not SET by this middleware
  }],
  {%- endif %}
  {%- if esbuild %}
  [middleware.esbuild, {
    // source: 'client', // the directory in which to look for entry point files to map to handler names
    // prefix: '_assets', // the URL prefix from which built assets will be served in development.
    // destination: '<a temporary directory>', // the path on disk at which to store built assets. Defaults to a temp dir.
    // options: {} // options to pass to esbuild
  }],
  {%- endif %}
]
