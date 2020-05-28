# boltzmann

Boltzmann is a JavaScript framework for writing web servers. It is implemented in a single file that lives alongside your code. Boltzmann is focused on delivering a great developer experience and makes its tradeoffs with that goal in mind.

Our design goals:

- Make all return values from route handlers and middlewares be valid responses, mapping to http semantics.
- Prefer zero-cost abstractions: pay for what you use and nothing more, including in installation and startup time.
- Use global types, no special response types.
- Only modify objects we provide; do not rely on modifications to node's request & response objects.
- Provide pluggable behavior for body-parsing and middleware, with good defaults.
- Use only minimal, well-vetted dependencies.
- Bake in observability (optionally), via [Honeycomb](https://honeycomb.io) tracing.
- Rely on a little bit of documented convention to avoid configuration.
- Making throwing Boltzmann away if you need to move on _possible_.

Boltzmann provides Typescript definitions for its exports, for your development convenience, but it does not require you to opt-in to Typescript or do any transpilation. We'd like you to be able to run Boltzmann apps under deno or in a web worker some day, so we make API choices that move us toward that goal.

Who's the "we" in this document? @ceejbot and @chrisdickinson.

## Hello world

To get started with Boltzmann, download the `boltzmann` command-line tool. You can get it from [the releases page][https://github.com/entropic-dev/boltzmann/releases] or run it via `npx boltzmann-cli`. The tool is responsible for initializing a new Boltzmann project as well as keeping it up to date. You enable or disable specific Boltzmann features using the tool.

For example, to scaffold with the defaults:

```sh
npx boltzmann-cli ./hello
cd hello
npm install
```

A complete Boltzmann hello world is provided for you:

```js
// handlers.js, in the same directory as boltzmann.js
import { Context } from './boltzmann.js' // optionally pull in typescript definition

greeting.route = 'GET /hello/:name'
export async function greeting(/** @type {Context} */ context) {
    return `hello ${context.params.name}`
}
```

To run: `./boltzmann.js`. And to view the response: `curl http://localhost:5000/hello/world`

## Creating a boltzmann app

This repo includes a command-line tool, `boltzmann`, that generates a single javascript file with all of Boltzmann's implementation, and some scaffolding for a full Boltzmann app if it's not already present. The tool enables or disables specific Boltzmann features. The tool is safe to re-run, provided you are running it in a versioned git directory.

To scaffold with redis and honeycomb:

```sh
npx boltzmann-cli --postgres --honeycomb todo-api
```

This creates a new project in `./todo-api` with postgres and Honeycomb integration enabled. If it finds existing code in `./todo-api`, it updates `boltzmann.js`.

The scaffold currently assumes you're using node as your runtime and NPM as your package manager. It installs its dependencies for you, at the versions it needs. From this moment on, both boltzmann and its dependencies are under your management. Boltzmann is in your app repo as a *source file*, not as a dependency. You are free to make changes to the Boltzmann file, but be aware the scaffolding tool won't respect your changes if you run it again to update. You are also free to update or pin Boltzmann's dependencies.

If you need to change Boltzmann's core behavior, you can either re-run the command-line tool to change features *or* write your own middleware. You'll be writing your own middleware for any reasonably complex project anyway!

## Features

Here are the features you can enable or disable at the command-line:

- ping: respond to `GET /ping` with a short text message; on by default
- status: respond to `GET /status` with a JSON object with process information; off by default
- postgres: provide a postgres client via middleware; off by default
- redis: provide a redis client via middleware; off by default
- honeycomb: send trace data to honeycomb for each response, with a span for each middleware executed

If this documentation lags reality, `npx boltzmann-cli --help` is a definitive source of truth.

## The Boltzmann API

If you prefer to look at working example code, we've provided examples in the [`./examples`](https://github.com/entropic-dev/boltzmann/tree/latest/examples) directory of this repo.

### Environment variables

Boltzmann respects the following environment variables out of the box:

- `NODE_ENV`: dev(elopment), prod(uction), or test; consumed by [are-we-dev](https://github.com/chrisdickinson/are-we-dev)
- `LOG_LEVEL`: one of error, warn, info, debug; defaults to `debug`
- `PORT`: the port to listen on; defaults to 5000; boltzmann always binds `0.0.0.0`.
- `DEV_LATENCY_ERROR_MS`: in dev mode, the length of time a middleware is allowed to run before it's treated as hung
- `DEV_LATENCY_WARNING_MS`: in dev mode, the length of time a middleware can run before you get a warning that it's slow
- `GIT_COMMIT`: a bit of text labeled as the git hash for the current running service; used by the optional status endpoint
- `HONEYCOMBIO_DATASET`: the name of your Honeycomb dataset, if you have enabled the feature
- `HONEYCOMBIO_WRITE_KEY`: a write key, if you have enabled the Honeycomb feature
- `PGURL` & `PGPOOLSIZE`: passed to the postgres pool constructor, if postgres is enabled
- `REDIS_URL`: passed to redis client constructor, if redis is enabled
- `SERVICE_NAME`: the name of the service to advertise to Honeycomb and others; falls back to the name of your package in package.json

### The context object

Every route handler receives exactly one parameter: a context object. You should extend the context object with whatever data you find useful to preserve through the lifetime of a single request. The context exposes the following getters for data you're likely to find useful:

- `method`: the request method
- `headers`: the request headers
- `url`: the parsed request url
- `query`: the request query params, if any
- `params`: the request url params, if any
- `body`: a promise that resolves to the request body content
- `start`: timestamp in ms since the epoch of when the request started to be handled
- `accepts`: content-negotiation for the request, provided by [accepts](https://github.com/jshttp/accepts)
- `request`: the raw node request object
- `redisClient`: a [node-redis](https://github.com/NodeRedis/node-redis) client; present if you have enabled the redis feature
- `postgresClient`: a [node-postgres](https://github.com/brianc/node-postgres) client; present if you have enabled the postgresql feature

### Route handlers

Route handlers are functions with a `route` field. The route field is a [find-my-way](https://github.com/delvedor/find-my-way) route with a little sugar. The handler is a function that takes a context object and returns a plain old Javascript object *or* throws an error.

Boltzmann looks for handlers exported by the following two places:

- from `handlers.js` in the same directory (good for small services)
- from `handlers/index.js`

The scaffolding tool gives you a working `handlers.js` file.

The route field should look like this: `VERB /path/with/:params`. The first segment of the string must be an http verb that `find-my-way` can pass to its `route.on()`. The second segment must be a path format that `find-my-way` understands.

To respond to a request with data, return the data from your handler function. Boltmann will correctly set content type headers for several common response types, like `text/plain` and `application/json`.

Here is a Boltzmann hello world:

```js
greeting.route = 'GET /greeting'
function greeting(context) {
    return 'hello world'
}
```

To return an error, throw. Here's an example of an error response with a custom status code:

```js
throwup.route = 'GET /error'
function throwup(context) {
    throw Object.assign(new Error('this has not yet been implemented'), {[Symbol.for('status')]: 501)
}
```

To control response headers and status, add `Symbol.for('status')` and `Symbol.for('headers')` symbols as attributes to your response object. You can do this in normal responses as well as error responses. We use symbols so we don't collide with any fields you might want to put on your response object yourself.

A route can also have an optional `.version` field. A version string instructs `find-my-way` to use the accept-version header field to match incoming requests to the version of the route provided. By convention, you must use valid semver in version fields.

Routes have one more meaningful optional field: `decorators`.

### Decorators and middleware

Change route handler behavior by wrapping your handlers in *decorators*. Add behavior to all routes by defining *middleware*. This is an important part of Boltzmann's API and a place where it differs from Express and Connect-middleware style node frameworks. We borrow some concepts from [aspect-oriented programming](https://en.wikipedia.org/wiki/Aspect-oriented_programming) and Python [decorators](https://en.wikipedia.org/wiki/Aspect-oriented_programming), so if you've used frameworks like Django you'll find this approach familiar.

Decorators and middleware have the same API. The difference is that "middlewares" are set up for the whole application: they apply to every route. Decorators are applied to only the routes that need them. Use a decorator when you want to require, for example, administrator-only access to a set of routes, or when you'd like to lookup a user object from a session cookie and put it onto your context.

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

### Built-in middleware

TODO

### Built-in decorators

Boltzmann provides three validator decorators that rely on [the ajv schema validator](https://github.com/epoberezkin/ajv) for you to enforce a schema for your route parameters, query params, and body.  The functions are:

- `boltzmann.decorators.body`: validate the structure of an incoming body
- `boltzmann.decorators.query`: validate parameters in the query string
- `boltzmann.decorators.params`: validate route parameters

Here's an example of a route parameter that must be a uuid:

```js
identityDetail.route = 'GET /identities/identity/:id'
identityDetail.decorators = [
  boltzmann.decorators.params({
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' }
    }
  })
]
async function identityDetail (/** @type {Context} */ context) { }
```

The `boltzmann.decorators.params` function takes an ajv schema and generates a decorator that applies the schema to any route params supplied.

### Tests

Boltzmann uses tap for testing. It provides some convenience wrappers to make testing your route handlers easier. It provides [shot](https://github.com/hapijs/shot) as a way to inject requests into your service. If you're using postgres, it wraps each test in a transaction so you can exercise your db code without changing state in your underlying database. We feel that databases are not behavior we want to replicate in mocks. It's more useful to test use of the db directly.

Here's an example test from a real-world Boltzmann service:

```js
import { decorators } from '../boltzmann.js'
import { test } from 'tap'

const _ = decorators.test({})

test('sessionCreate: can create a session', _(async assert => {
  const result = await assert.request({
    url: '/sessions',
    method: 'POST',
    body: { hello: 'world' }
  })

  assert.equal(result.statusCode, 201)
  assert.ok(result.json.id.length)
  assert.same(result.json.session.data, { hello: 'world' })
  assert.ok(Date.parse(result.json.session.created))
  assert.ok(Date.parse(result.json.session.updated))
}))
```

TODO: example of setting up middleware for tests

## LICENCE

Apache-2.0.
