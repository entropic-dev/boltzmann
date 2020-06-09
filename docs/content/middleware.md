+++
title="Middlware and decorators"
weight=9
+++

Change the behavior of your route handlers by wrapping them in *decorators*. Change the behavior of all routes by defining *middleware*. This is an important part of Boltzmann's API and a place where it differs from Express and Connect-middleware style node frameworks. We borrow some concepts from [aspect-oriented programming](https://en.wikipedia.org/wiki/Aspect-oriented_programming) and Python [decorators](https://en.wikipedia.org/wiki/Aspect-oriented_programming), so if you've used frameworks like Django you'll find this approach familiar.

Decorators and middleware have the same API. The difference is that "middlewares" are set up for the whole application: they apply to every route. Decorators are applied to only the routes that request them. Use a decorator when you want to require, for example, administrator-only access to a set of routes, or when you'd like to lookup a user object from a session cookie and put it onto your context. Use middleware to provide useful clients for external resources to all your routes, or to compress responses when the request accept headers allow.

Use body middleware to parse entirely new kinds of body input.

To add decorators to a route, add a `decorators` field. The `decorators` field must be an array of functions. They're called in the order you list them in the array. Your route handler is called last.

To set up your server with middleware, export an array of middleware where Boltzmann can find it. Boltzmann looks for middleware exported by the following two places:

- from `middleware.js` in the same directory (good for small services)
- from `middleware/index.js`

The scaffolding tool gives you a working `middleware.js` file.

What is this decorator/middleware api? A decorator takes a `next` parameter and returns a function that takes a single context `param`. Here's a generic Boltzmann middleware file, suitable to copy-n-paste to start yours:

```js
// in middleware.js
function setupMiddlewareFunc (/* your config */) {
  // startup configuration goes here
  return function createMiddlewareFunc (next) {
    return async function inner (context) {
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

modules.exports = [
    setupMiddlewareFunc
]
```

See `examples/middleware/` for some meatier examples. Pro tip: debugging is easier if you name each of these layers instead of using anonymous functions.


## Built-in middleware

TODO: list and describe; examples of configuration

## Built-in body parsers

