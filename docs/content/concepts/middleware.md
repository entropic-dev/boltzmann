+++
title="Middleware"
weight=9
+++

## Introduction

Middleware allows you to intercept, modify, or add behavior to your
application's request handling. You attach middleware to Boltzmann either to
your application, or to individual handlers. This allows you to modify request
handling for all, or a subset of, your handlers.

Middleware is useful for:

- **Attaching** domain-specific attributes to request context: if you were to
  build a pizza-ordering service, you might use middleware to attach
  `context.pizzaClient = new DominosAPIClient()`.
- **Modifying** the response from handlers in your application. For example,
  [we've implemented example `gzip` middleware][ref-gzip].
- **Intercepting** the request before it reaches the rest of your application,
  allowing you assert facts about request context that reaches your handlers.
  For example, you might have middleware that responds to any unauthenticated
  request with a 401. As a result of this hypothetical middleware, the handlers
  in your application can rely on the fact that the user is authenticated.

Middleware is Boltzmann's primary mechanism for exposing configurable behavior
to you. It is also Boltzmann's mechanism for enabling [dependency
injection][ref-di]. It's a powerful concept! This document will cover how to
talk about middleware and how to attach it to your application. Other documents
cover [how to write middleware][ref-guide] and [what middleware boltzmann makes
available to your application][ref-reference].

> :warning: This document does not cover how to parse incoming request bodies.
> that information is available [in the body parsing] document.

---

## What is middleware?

Middleware is a repeatable mechanism for layering handlers and allowing them
to delegate control to inner handlers. That's kind of a mouthful!

Middleware is structured like an **onion**. A single middleware is like a layer
of the onion. When Boltzmann responds to a request, it draws a line through
that onion. Each layer may pass control to the next layer in the onion using
`next()`, or it can respond to the request directly, skipping the inner layers
of the onion. For every layer the request passes through coming in, it will
have to travel back out through in order to send a response.

If you cut one of the outer layers off of an onion and take out the inside, you
get another, smaller onion. This is analogous to Boltzmann middleware: if you
cut a layer of middleware off of your application, you still have the other
layers making up the application. Boltzmann uses this property to let outer
layers of the application assert facts that inner layers may rely upon without
knowing _how_ those facts are asserted. Concretely: if you are using redis
middleware, every layer of your application past the redis middleware layer
may rely on the availability of `context.redisClient`, but they are _agnostic
of how that property came to exist and the concrete type to which it points._
Indeed, under test, you might cut out the redis middleware and replace it with
middleware that puts a mock redis client implementation in place!

In order to talk about how to write middleware, it is handy to have a shared
vocabulary for talking about the anatomy of a single middleware. What follows
is a TypeScript set of definitions for middleware, and an associated example.
Do not fret if you're not comfortable reading this syntax! After the
example each of the types will be broken down in natural language.

```typescript
const HEADER = Symbol.for('headers')
const STATUS = Symbol.for('status')

type HttpMetadata      = {[HEADER]: {[key: string]: string}} & {[STATUS]: number};
type UserResponse      = string | AsyncIterable<Buffer | string> | Buffer | Object;
type BoltzmannResponse = (AsyncIterable<Buffer | string> | Buffer | Object) & HttpMetadata;
type Handler           = (context: Context, ...args: any[]) => UserResponse | Promise<UserResponse>;
type Next              = (context: Context, ...args: any[]) => Promise<BoltzmannResponse>;
type Adaptor           = (next: Next) => Handler | Promise<Handler>;
type Middleware        = (options?: Object) => Adaptor;

function middleware (_options = {}) {
  return function adaptor (next: Next): Handler {
    return async function handler (context: Context, ...args): Promise<UserResponse> {
      return next(context, ...args)
    }
  }
}
```

Middleware has three parts: the outermost function receives _configuration
options_, which it is responsible for validating. It may throw an error if bad
options are provided, preventing the application from starting. Middleware is
generally called _once_ at application startup. Naming this function is useful:
the name of the middleware will be included in Honeycomb traces if that feature
is enabled, and it will be displayed by the development-mode debugging
middleware if a stall happens. 

Middleware returns an `Adaptor` function. The `Adaptor` function receives a
`Next` function as an argument and returns a `Handler`. Adaptors, like the
outer middleware, are called _once_ at application startup. The `Adaptor` can
be asynchronous! If there are asynchronous setup steps, like connecting to a
database or reading a file from disk, they should be performed here. Again,
this function may throw an error if configuration is bad or necessary
resources are unavailable.

The application will not start accepting requests until the `Adaptor` returns a
`Handler`. The `Handler` is executed whenever your application receives an HTTP
request; it receives a [`Context` object](@/concepts/context.md) and returns a
[UserResponse](@/concepts/responses.md). It may call the `Next` function
provided as an argument to the `Adaptor` function zero-to-many times. You can
think of calling `next()` as making a request to the inner part of your
application! `next()` will **never** throw, and the return value is guaranteed
to have a status code and headers associated with it. The body of the `Handler`
is where your middleware logic should be implemented.

---

## Attaching & Configuring Middleware

Middleware may be attached in one of two places, which is referred to as the
"scope" of the middleware. The widest scope is application-wide: if you need
logic to be performed on every request sent to your application, you can attach
it in `middleware.js` or `middleware/index.js` by exporting an `APP_MIDDLEWARE`
property that points at an array of your middleware:

```javascript
// middleware/index.js
const myMiddleware = require('./my-middleware')

module.exports = {
  APP_MIDDLEWARE: [
    myMiddleware
  ]
}
```

This will register the middleware application-wide. Application-scope attached
middleware will execute before Boltzmann routes the request; they will execute
even for requests that **match no corresponding route** in your application!

If, on the other hand, you need logic to be applied to **many** handlers, but not
**all**, you may wish to attach your middleware directly to handlers:

```javascript
// handlers.js

module.exports = {
  palindromesOnly,
  anyWords
}

palindromesOnly.route = 'GET /any/:utterance'
function anyWords (context, { utterance }) {
  return 'yep that seems about correct'
}

const handleNonPalindromes = require('../middleware/non-palindromes')
palindromesOnly.route = 'GET /palindromes/:utterance'
palindromesOnly.middleware = [
  handleNonPalindromes // highly sophisticated middleware that 404s on non-palindromes
]
function palindromesOnly (context, { utterance }) {
  return 'ok ko'
}
```

In this example, only `palindromesOnly` is guarded by the
`handleNonPalindromes` middleware.

---

Both app-wide and handler-specific middleware scopes accept an `Array` of
`Middleware`. Middleware is executed in order, and responses from inner middleware
bubble back up the list in reverse order:

```javascript
// middleware.js
module.exports = {
  APP_MIDDLEWARE: [
    one,
    two,
    three
  ]
}
```

```javascript
// handlers.js
module.exports = { hello }

hello.route = 'GET /'
hello.middleware = [
  four,
  five
]
function hello (context) {
  return 'six'
}
```

In this example, a request to `GET /` will execute `one`, `two`, `three`,
`four`, `five`, and finally respond with six. The `'six'` response will be
received by `five`, then `four`, then `three`, and so on.

If a given middleware requires additional configuration, it can be provided
arguments by turning the entry into an array of `[Middleware, ...arguments]`,
which will be evaluated when the application starts up:

```javascript
// middleware.js
module.exports = {
  APP_MIDDLEWARE: [
    one,
    [two, {wow: 'an argument'}], // configure "two" with additional params
    three
  ]
}
```

```javascript
module.exports = { hello }

hello.route = 'GET /'
hello.middleware = [
  [four, 'argument one', 'argument two'],
  five
]
function hello (context) {
  return 'six'
}

```

Insofar as is possible, middleware _should_ be designed such that attaching
it with no arguments is valid. If configuration is necessary, it should fail
noisily at startup!

## Next Steps

Now that you know the vocabulary for middleware, and how and when to attach it
to your application, it's time to write some middleware. [This
guide][ref-guide] will take you through writing your first middleware. You may
also be interested in reviewing the [built-in middleware that Boltzmann makes
available][ref-reference]. Happy hacking!

[ref-di]: https://en.wikipedia.org/wiki/Dependency_injection
[ref-gzip]: https://github.com/entropic-dev/boltzmann/blob/latest/examples/custom-middleware/middleware/gzip.js
[ref-guide]: @/guides/middleware.md
[ref-reference]: @/reference/middleware.md
[in the body parsing]: @/concepts/body-parsing.md
