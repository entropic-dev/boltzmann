+++
title = "Request Handlers and Routing"
slug = "handlers"
weight = 1
+++

Request handlers are a fundamental building block of Boltzmann applications.
They are functions which you provide to Boltzmann to **handle** incoming HTTP
requests.

This document will cover how to write handler functions, how to control request
routing, how handler responses are interpreted, and how to control these
behaviors using attributes on your exported functions.

<!-- more -->

## What is a Request Handler?

A request handler is any function exported from `handlers.js` (or
`handlers/index.js`) that has a `.route` property. A request handler is
called with a [`Context`] object when an incoming HTTP request matches against
its `.route` attribute.

A TypeScript definition of the types involved is included below. Don't worry if
you're not comfortable reading this syntax! We'll cover each of the types below
in natural language in this document.

```typescript
class Context {
  // Contents covered in reference doc.
}

const HEADERS = Symbol.for('headers')
const STATUS = Symbol.for('status')

type UserResponse      = {[STATUS]?: number, [HEADERS]?: {[key: string]: string}} & 
                         (string | AsyncIterable<Buffer | string> | Buffer | Object);
type Handler           = {
  route?: String,
  method?: String,
  version?: String,
  middleware?: Array<Function | [Function, any...]>
} & (context: Context, ...args: any[]) => UserResponse | Promise<UserResponse>;
```

## Context

When Boltzmann receives an HTTP request, it wraps the Node.JS [request and response]
objects in a [`Context`] instance. The `Context` object provides useful information about
the request:

- The request headers & method
- The matched URL route parameters
- A parsed URL object
- [A mechanism for content-type negotiation]
- Clients enabled by flags, like `postgresClient` or `redisClient`
- Cookie support
- [Body parsing support]

In short, it contains all relevant information about the current request.

Additionally, it is intended for _extension_: you are expected to attach your own
clients to the `Context` using middleware, which we'll cover [in the next chapter].

For more on the specific properties of the `Context` object, see the [reference
documentation].

Request handlers are responsible for mapping incoming request `Context` to desired
response data. But how does Boltzmann know which handler to call for a given HTTP
request?

## Routing

Your exported handlers are mounted to an internal-to-Boltzmann [`find-my-way`]
router based on their `.route` attribute:

```javascript
// handlers.js

module.exports = {
  greeting
}

greeting.route = 'GET /hello'
function greeting (context) {
  return `hello world!`
}
```

This handler will fire whenever the server receives a `GET` request for `/hello`, and
it will return the plain text string `hello world!`

The router is capable of matching against provided parameters, as well. For
example, to handle requests like `GET /hello/world` or `GET /hello/mars` with a
single handler, you might write something like the following.

```javascript
// handlers.js

module.exports = {
  greeting
}

greeting.route = 'GET /hello/:subject'
function greeting (context) {
  return `hello ${context.params.subject}!`
}
```

The portion of the path that matched `:subject` will be available as
`context.params.subject`.

`find-my-way` supports many different parameter behaviors:

- You can define multiple params in a path: `/:foo-:bar`
- You can include regexen as part of the parameter definition: `/:foo(\\d+)`
- You can specify wildcard params: `/*`, which will be available at `context.params['*']`

[`find-my-way`] has excellent [documentation][ref-fmw].

### Handling multiple methods with a single handler

If you wish to install a handler for multiple methods, you can split the route
definition like so:

```javascript
greeting.method = ['GET', 'POST']
greeting.route = '/hello/:subject'
function greeting (context) {
  return `hello ${context.params.subject}!`
}
```

`.route = 'GET /foo'` is shorthand for `.route = '/foo'; .method = ['GET'];`.

### Handling different versions of the same route

Over the course of time, your application might update the functionality of a given
handler. In order to support both the old behavior and the new behavior, you can
_version_ your APIs using the `.version` attribute:

```javascript
LOUD_GREETING.route = 'GET /hello/:subject'
LOUD_GREETING.version = '2.0.0'
function LOUD_GREETING (context) {
  return `hello ${context.params.subject}!`.toUpperCase()
}


greeting.route = 'GET /hello/:subject'
function greeting (context) {
  return `hello ${context.params.subject}!`
}
```

Boltzmann will examine the incoming `Accept-Version` request header in order to
determine which handler to dispatch the request to. Clients may specify the header in
[semver] format. For example, you might have handlers for versions `1.0.0`, `1.2.0`, and
`2.0.0`. A client could then request `1.x`, `^1.2.0`, or `2.0.0` and expect to be routed
to the appropriate version.

For more information on route versioning, see the [`find-my-way` docs on versioning][ref-fmw-ver].

## Responses

As we stated before, handlers are responsible for mapping your internal application semantics --
the types and error codes your business logic is implemented in terms of -- into HTTP semantics.
Boltzmann is here to lend a helping hand by providing useful defaults for common JavaScript
control flow semantics and types.

By default, returning a value from a handler will create a HTTP [`200 OK`]
response. If your handler returns `undefined`, Boltzmann will generate a [`204
No Content`] response. If your handler throws an error, Boltzmann will map that
to a [`500 Internal Server Error`] response by default.

All of this behavior can be configured using [global Symbols]. Boltzmann respects the following
symbols on any returned or thrown value:

- `Symbol.for('status')`: Sets the outgoing HTTP response status code.
- `Symbol.for('headers')`: Sets the HTTP response headers.
- `Symbol.for('template')`: If the [`--templates`] flag is enabled, sets the template used for rendering.

Beyond control flow mapping, Boltzmann casts different return types into HTTP
response bodies with appropriate headers:

- Strings become `Buffer` instances containing [UTF8] data.
- Node.JS [`ReadableStream`] objects will be treated as `application/octet-stream` data unless
  otherwise specified.
- JavaScript objects and class instances will be stringified and returned as `application/json` data.
  Note: this invokes the [`toJSON`] method on all objects in the tree, so you can control the serialized
  representation of class instances you return.
- `undefined` will become an empty `Buffer` and treated as a `204 No Content`.

You may use `Object.assign` to decorate your responses with this metadata, or provide your own classes:

```javascript

create.route = 'POST /things'
async function create(context) {
  const myThing = await context.thingFactory.createThing()
  return Object.assign(thing, {
    [Symbol.for('status')]: 201
  })
}

class ThingNotFound extends Error {
  [Symbol.for('status')] = 404
}

create.route = 'DELETE /things/:id'
async function destroy(context) {
  try {
    await context.thingFactory.deleteThing(context.params.id)
    // 204 on success by returning nothing at all!
  } catch (err) {
    // Map internal application semantics to HTTP semantics:
    if (err.code === 'NO_SUCH_THING') {
      throw new ThingNotFound(`No thing by that id: ${context.params.id}`) 
    }

    throw err
  }
}
```

## Next Steps

In this chapter, we defined the role handlers play in your application, how they are
routed and dispatched, what information they receive, and how to control their output.
[In the next chapter, we'll cover middleware], which allows you to wrap all (or a subset of)
your handlers with additional behavior -- think of them as higher-order handlers!

[request and response]: https://nodejs.org/api/http.html#http_event_request
[reference documentation]: @/reference/_index.md
[`Context`]: @/reference/context.md
[`200 OK`]: https://httpstatuses.com/200
[`204 No Content`]: https://httpstatuses.com/204
[`500 Internal Server Error`]: https://httpstatuses.com/500
[`--templates`]: @/reference/cli.md
[`ReadableStream`]: https://nodejs.org/api/stream.html#stream_class_stream_readable
[A mechanism for content-type negotiation]: https://www.npmjs.com/package/accepts
[global Symbols]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/for
[`find-my-way`]: https://github.com/delvedor/find-my-way
[`toJSON`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#Description
[body parsing support]: @/concepts/04-accepting-input.md
[in the next chapter]: @/concepts/02-middleware.md
[In the next chapter, we'll cover middleware]: @/concepts/02-middleware.md
[ref-fmw]: https://github.com/delvedor/find-my-way#supported-path-formats
[ref-fmw-ver]: https://github.com/delvedor/find-my-way#semver
[semver]: https://semver.org/
[UTF8]: https://simple.wikipedia.org/wiki/UTF-8
[`--templates`]: @/reference/cli.md#templates
