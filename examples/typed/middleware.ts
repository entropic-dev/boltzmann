import { Context, Handler } from './boltzmann'

// All Boltzmann middleware looks like this.
// Middleware can be attached to either the app or individual routes.
export function setupMiddlewareFunc(/* your config */) {
  // startup configuration goes here
  return function createMiddlewareFunc(next: Handler) {
    return async function inner(context: Context) {
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
  return (next: Handler) => {
    return (context: Context) => {
      return next(context)
    }
  }
}

// This export is special: it instructs Boltzmann to attach
// middlewares to the app in this order.
// This is also where you can configure built-in middleware.
export const APP_MIDDLEWARE = [
  setupMiddlewareFunc,
  // [middleware.session, {
  // secret: process.env.SESSION_SECRET || 'a very secure secret set surreptitiously'.repeat(5),
  // salt: process.env.SESSION_SALT || 'fifteen pounds of salt',
  // cookieOptions: {}
  // }],
]
