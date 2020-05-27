# boltzmann

A catchy slogan here.

Boltzmann doesn't try to be fast. We have no idea how fast or how slow Boltzmann is, in fact. (If we needed to be fast, we'd use Rust.) We are focused on *developer experience*. Things that we find we need to do every time we write a web service, we want our framework to do out of the box. We also do not want to invent more than we need to. Boltzmann is a thin wrapper around well-tested http primitives, such as [jshttp project](https://github.com/brianc/node-postgres) and [find-my-way](https://github.com/brianc/node-postgres). Our goal is that it should be easy to _throw Boltzmann away_ if you move on from it.

Our API goals are:

- Make all return values from route handlers and middlewares be valid responses, mapping to http semantics.
- Zero-cost abstractions: pay for what you use and nothing more, including in installation and startup time.
- Use global types, no special response types.
- Only modify objects we provide; do not rely on access to node's request & response objects.
- Provide pluggable behavior for body-parsing and middleware, with good defaults.
- Bake in observability (optionally), via [Honeycomb](https://honeycomb.io) tracing.

Boltzmann provides Typescript definitions for its exports, for your development convenience, but it does not require you to opt-in to Typescript or do any transpilation. We'd like you to be able to run Boltzmann apps under deno or in a web worker some day, so we make API choices that move us toward that goal.

## Hello world

A complete Boltzmann hello world:

```js
// handlers.js, in the same directory as boltzmann.js
import { Context } from './boltzmann.js' // optionally pull in typescript definition

greeting.route = 'GET /hello/:name'
export async function greeting(/** @type {Context} */ context) {
    return `hello ${context.params.name}`
}
```

To run: `./boltzmann.js`. And to view the response: `http GET localhost:5000/hello/world`

## Creating a boltzmann app

This repo provides a command-line tool, `ludwig`, that generates a single javascript file with all of Boltzmann's implementation, and some scaffolding for a full Boltzmann app if it's not already present. The tool enables or disables specific Boltzmann features. The tool is safe to re-run, *provided* you are running it in a versioned git directory.

To scaffold with redis and honeycomb:

```sh
ludwig redis honeycomb
```

The scaffold currently assumes you're using node as your runtime and NPM as your package manager. It installs its dependencies for you, at the versions it needs. From this moment on, both boltzmann and its dependencies are under your management. Boltzmann is in your app repo as a source file, not as a dependency you install. You are free to make changes to the Boltzmann file, but be aware the scaffolding tool won't respect your changes if you run it again to update.

If you need to change Boltzmann's core behavior, you can either re-run the command-line tool to change features *or* write your own middleware. You'll be writing your own middleware for any reasonably complex project anyway!


## The Boltzmann API

Examples

### Environment variables

Boltzmann respects the following environment variables out of the box:

- `NODE_ENV`
- `LOG_LEVEL`: one of error, warn, info, debug; defaults to `debug`
- `PORT`: the port to listen on; boltzmann always binds to listen to all hosts.
- `DEV_LATENCY_WARNING_MS`: in dev mode, the length of time a middleware can run before you get a warning that it's slow
- `DEV_LATENCY_ERROR_MS`: in dev mode, the length of time a middleware is allowed to run before it's treated as hung
- `SERVICE_NAME`: the name of the service to advertise to Honeycomb and others; falls back to the name of your package in package.json
- `HONEYCOMBIO_WRITE_KEY`: a write key, if you have enabled the Honeycomb feature
- `HONEYCOMBIO_DATASET`: the name of your Honeycomb dataset, if you have enabled the feature


### The context object

Every route handler receives exactly one parameter: a context object.

* `method`: the request method
* `headers`: the request headers
* `url`: the parsed request url
* `query`: the request query params, if any
* `body`: a promise that resolves to the request body content
* `start`: timestamp in ms since the epoch of when the request started to be handled
* `accepts`: content-negotiation for the request, provided by [accepts](https://github.com/jshttp/accepts)
* `request`: the raw node request object
* `redisClient`: a [node-redis](https://github.com/NodeRedis/node-redis) client; present if you have enabled the redis feature
* `postgresClient`: a [node-postgres](https://github.com/brianc/node-postgres) client; present if you have enabled the postgresql feature



### Route handlers

Route handlers are functions with a `route` field. The route field is a [find-my-way]() route with a little sugar. The handler is a function that takes a context object and returns a plain old Javascript object.

To respond to a request with data, return the data from your handler function. Here is a Boltzmann hello world:

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

### Decorators and middleware

Decorators and middleware have the same API. The difference is that middleware are set up for the whole application: they apply to every route. Decorators are applied to only the routes that need them; you decorate routes with functions to do small tasks. Here we borrow some concepts from [aspect-oriented programming](https://en.wikipedia.org/wiki/Aspect-oriented_programming) and Python [decorators](https://en.wikipedia.org/wiki/Aspect-oriented_programming).

A route can have an optional `decorators` field. The decorators field must be an array of functions that wrap the handler function. Boltzmann provides three validator decorators that rely on [the ajv schema validator](https://github.com/epoberezkin/ajv) for you to enforce a schema for your route parameters, query params, and body.  The functions are:

* `boltzmann.decorators.body`: validate
* `boltzmann.decorators.query`: validate parameters in the query string
* `boltzmann.decorators.params`: validate route parameters

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
async function identityDetail (/** @type {Context} */ context, params) { }
```

The `boltzmann.decorators.params` function takes an ajv schema and generates a decorator that applies the schema to any route params supplied.

A route can also have an optional `.version` field. A version string instructs `find-my-way` to use the accept-version header field to match incoming requests to the version of the route provided. By convention, you must use valid semver in version fields.


A generic Boltzmann middleware file, suitable to copy-n-paste to start yours:

```js
// in middleware.js
function setupMiddlewareFunc () {
  return function createMiddlewareFunc (next) {
    return async function inner (context) {
      // do things like make objects to put on the context
      // then give following middlewares a chance
      // route handler runs last
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

See `examples/middleware/` for some meatier examples.

### Write a test

- hygienic tests
- built on top of tap (we'd like to replace this)
- boltzmann decorates the test object
- `t.request()` lets you make a request against your service
- tests run in a transaction so they can't interfere with state

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

## Optional built-in features

### Redis

### Postgres

### Honeycomb

## Dependencies

- [accepts]()
- [ajv]()
- [are-we-dev]()
- [bole]()
- [culture-ships]()
- [dotenv]()
- [find-my-way]()
- [handy-redis]()
- [honeycomb-beeline]()
- [on-headers]()
- [pg]()
- [redis]()


## TODO

- write the command-line tool lol.
- write examples
- Hide ajv by presenting a better facade for it.

Facts to make true:

- This is a rust tool
- it operates on `.`
- it takes its options as single-word arguments, with `--` in front of them optional
- mentioning a feature turns it on; `=off` removes the feature
- it generates a directory with some files in it
- it makes a package.json if none exists (npm -init -y)
- it installs its deps using bash to run npm
- it stores its options in package.json in the field `boltzmann`
- if you rerun it without options, it'll respect the ones in the package.json if found; cli options override the ones in package.json

`ludwig redis hc pg=off` scaffolds with redis and honeycomb, and turns off postgres.






## LICENCE

Apache-2.0.
