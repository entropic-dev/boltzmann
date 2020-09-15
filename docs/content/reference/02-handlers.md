+++
title="Handlers"
weight=2
slug="handlers"
[taxonomies]
tags = ["reference"]
+++

## Handler Options

## Context

### `accepts`

_Added in 0.0.0._

[Content negotiation] support for the request. Provided by the [`accepts`] package.
This property is lazily instantiated on access.

**Example use:**

```javascript
myHandler.route = 'GET /foo'
function myHandler(context) {
  switch (context.accepts.type(['json', 'html'])) {
    case 'json':
      return {'hello': 'world'}
    case 'html':
      const res = Buffer.from(`<h1>hello world</h1>`)
      res[Symbol.for('headers')] = {
        'content-type': 'text/html'
      }
      return res
    default:
      // default to text/plain
      return 'hello world'
  }
}
```

### `body`

_Added in 0.0.0._

A promise for the parsed contents of the request body. Will either return a
JavaScript object on success or throw a `422 Unprocessable Entity` error when
no body parser could handle the request body.

See ["accepting user input"] for more.

**Example use:**

```javascript
myHandler.route = 'POST /foo'
async function myHandler(context) {
  const body = await context.body
  // do something with the body
  if (body.flub) {
    return body.blarp
  }
}
```

### `cookie`

_Added in 0.1.1._

A specialized [`Map`] instance allowing access to [HTTP Cookie] information.
`.cookie` supports `.get`, `.set`, `.delete`, `.has`, and all other `Map`
methods.

`.cookie` maps cookie names (as strings) to cookie configurations:

```
{ httpOnly: Boolean, # defaults to true
  expires: Date,
  maxAge: Number,
  secure: Boolean, # defaults to true in production, false in development mode
  sameSite: true,  # defaults to true
  value: String
}
```

This configuration information is passed to the [`cookie`] package in order to create
[`Set-Cookie`] headers for outgoing responses.

The state of the cookie map is tracked; if any values are changed (or deleted), Boltzmann
will automatically generate and attach a `Set-Cookie` header to responses.

Incoming cookies don't contain enough information to recreate fields other than `.value`,
so those values will be synthesized with defaults.

**Example use:**

```javascript
logout.route = 'POST /foo'
async function logout(context) {
  const { value } = context.cookie.get('sessionid') || {}
  if (value) {
    cookie.delete('sessionid')
  }
}

const uuid = require('uuid')

login.route = 'POST /login'
async function login(context) {
  const {username} = await context.body
  const id = uuid.v4()
  context.redisClient.set(id, username)

  context.cookie.set('sessionid', {
    value: username,
    maxAge: 60 // 1 minute! HOW VERY SECURE
  })
}
```

### `headers`

_Added in 0.0.0._

The HTTP [Request Headers] as a plain JavaScript object.

This forwards the [Node.JS request headers object]. All headers will be lower-cased
and follow the concatenation rules for repeated headers listed in the linked document.

**Example use:**

```javascript
logout.route = 'GET /'
async function logout(context) {
  return context.headers['content-type']
}
```

### `host`

_Added in 0.0.0._

The hostname portion of the [`Host` request header], minus the port. Note that this
is the `Host` header received by the Node.JS process, which may not be the same as the
requested host (if, for example, your Boltzmann application is running behind a reverse
proxy such as nginx.)

**Example use:**

```javascript
host.route = 'GET /'
async function host(context) {
  return context.host // "localhost", if running locally at "localhost:5000"
}
```

### `id`

_Added in 0.0.0._

A unique string identifier for the request for tracing purposes. The value will be drawn
from:

1. `x-honeycomb-trace`
2. `x-request-id`
3. A generated [ship name from Iain M Bank's Culture series][culture] (e.g.: `"ROU Frank Exchange Of Views"`)

**Example use:**

```javascript
const bole = require('bole')

log.route = 'GET /'
async function log(context) {
  const logger = bole(context.id)
  logger.info('wow what a request')
}
```

### `method`

_Added in 0.0.0._

The [HTTP verb] associated with the incoming request, forwarded from the underlying
[node request] object.

**Example use:**

```javascript
const assert = require('assert')

assertion.route = 'GET /'
async function assertion(context) {
  assert.equal(context.method, 'GET')
}
```

### `params`

_Added in 0.0.0._

`context.params` contains an object mapping URL parameter names to the resolved
value for this request. Wildcard matches are available as `context.params['*']`.

**Example use:**

```javascript
parameters.route = 'GET /:foo/bar/:baz'
async function parameters(context) {
  console.log(context.params) // { "foo": "something", "baz": "else" }
}
```

### `postgresClient`

_Added in 0.0.0._ **Requires the [`--postgres`] feature.**

A lazily-acquired [`Promise`] for a postgres [`Client`]. Once
acquired the same postgres connection will be re-used on every
subsequent access from a given `Context` object.

When accessed from a handler responsible for [unsafe HTTP methods],
the connection will automatically run as part of a transaction. For
more, read the ["persisting data" chapter].

**Example use:**

```javascript
postgres.route = 'GET /users/:name'
async function parameters(context) {
  const client = await context.postgresClient
  const results = await client.query("select * from users where username=$1", [context.params.name])
}
```

### `query`

_Added in 0.0.0._

`query` contains the URL search (or "query") parameters for the current
request, available as a plain javascript object.

If `context.url` is set to a new string, `context.query` will be re-calculated.

**Warning**: Duplicated querystring keys are dropped from this
object; only the last key/value pair will be available. If you
need to preserve _exact_ querystring information, use
`context.url.searchParams`, which is a [`URLSearchParams`]
object.

**Example use:**

```javascript
queries.route = 'GET /'
async function queries(context) {
  if (context.query.foo) {
    // if you requested this handler with "/?foo=1&bar=gary&bar=busey",
    // you would get "busey" as a result
    return context.query.bar
  }
}
```

### `redisClient`

_Added in 0.0.0._ **Requires the [`--redis`] feature.**

A [`handy-redis`] client attached to the context by middleware. A single client is
created for the process and shared between request contexts.

**Example use:**

```javascript
redis.route = 'GET /'
async function redis(context) {
  const [ok, then] = await context.redisClient.hmget('wow', 'ok', 'then')

  return { ok, then }
}
```

### `remote`

_Added in 0.0.0._

The remote IP address of the HTTP request sender. Drawn from [`request.socket.remoteAddress`],
falling back to `request.remoteAddress`. This value only represents the immediate connecting
socket IP address, so if the application is served through a CDN or other reverse proxy (like
nginx) the remote address will refer to that host instead of the originating client.

**Example use:**

```javascript
remote.route = 'GET /'
async function remote(context) {
  console.log(context.remote) // 127.0.0.1, say
}
```

### `start`

_Added in 0.0.0._

A `Number` representing the start of the application request processing,
drawn from [`Date.now()`].

**Example use:**

```javascript
timing.route = 'GET /'
async function timing(context) {
  const ms = Date.now() - context.start
  return `routing this request took ${ms} millisecond${ms === 1 ? '' : 's'}`
}
```

### `url`

_Added in 0.0.0._

A [`URL`] instance populated with the `host` header & incoming request path information.
This attribute may be set to a `String` in order to recalculate the `url` and `query`
properties.

**Example use:**

```javascript
uniformResourceLocation.route = 'GET /'
async function uniformResourceLocation(context) {
  console.log(context.url.pathname) // "/"

  context.url = '/foo/bar?baz=blorp'
  console.log(context.url.pathname) // "/foo/bar"
  console.log(context.query.baz) // "blorp"
}
```

## Response Symbols

Values returned (or thrown) by a handler or middleware may be annotated with
[symbols] to control response behavior. See the [chapter on "handlers"] for more.
A complete list of symbols and transformations follows.

### `Symbol.for('headers')` {#symbol-for-headers}

_Added in 0.0.0._

This symbol controls the HTTP response headers sent by Boltzmann along with
your handler's return value. It must point at an object whose keys will be used
as header names. The values will be used as header values.

When a response is returned by a handler (or middleware), Boltzmann will
enforce certain invariants before passing the response back to enclosing
middleware. In particular, if no `content-type` header is available on the
response headers, one will be added by Boltzmann. See [response
transforms](#response-transforms) below for details on which return types will
produce which `content-type` values.

**Example use:**

```javascript
wow.route = 'GET /'
async function wow(context) {
  return Object.assign(Buffer.from([]), {
    [Symbol.for('headers')]: {
      link: '</foo.css>; rel="stylesheet"'
    }
  })
}
```

### `Symbol.for('status')` {#symbol-for-status}

_Added in 0.0.0._

This symbol controls the HTTP response status code sent by Boltzmann along with
your handler's return value. It must point at an integer number.

If not given, Boltzmann will infer a status code. See [response
transforms](#response-transforms) below for details on which return types will
produce which status codes.

**Example use:**

```javascript
created.route = 'POST /'
async function created(context) {
  return {
    [Symbol.for('status')]: 201,
    [Symbol.for('headers')]: {
      location: '/new-resource-id'
    }
  }
}

errored.route = 'POST /frobs'
async function errored(context) {
  throw Object.assign(new Error('oh wow'), {
    [Symbol.for('status')]: 409,
  })
}

// You may also decorate application error classes
// with symbol information:
class TooCornyError {
  [Symbol.for('status')] = 418
}

errored2.route = 'POST /cobs'
async function errored2(context) {
  throw new TooCornyError('too much corn')
}
```

### `Symbol.for('template')` {#symbol-for-template}

_Added in 0.1.2._ **Requires the [`--templates`] feature.**

This symbol selects a template file to use to render the response
as HTML. It must refer to a string value. The [template middleware]
will attempt to load a file from one of its configured paths. These
paths default to `./templates` in the top level.

If the template cannot be found, the template middleware will
attempt to render a `5xx.html` template. If that cannot be found,
Boltzmann will render a fallback `500 Internal Server
Error` response.

**Example use:**

```javascript
html.route = 'GET /'
async function html(context) {
  return {
    some: 'context',
    [Symbol.for('template')]: 'intro.html'
  }
}
```

### `Symbol.for('threw')` {#symbol-for-threw}

_Added in 0.0.0._

This symbol is automatically added to thrown values by Boltzmann.
It signals that the next innermost middleware or handler threw
the return value; middleware may change behavior based on its
presence or absence. For example: the `postgres` middleware will
roll back transactions if it detects that the handler threw. You
can read more about this behavior in the ["persisting data"
chapter].

**Example use:**

```javascript

// a middleware to introspect the "threw" symbol
function didItThrow() {
  return next => async context => {
    const result = await next(context)
    if (result[Symbol.for('threw')]) {
      console.log('it threw!')
    }
    return result
  }
}

example.route = 'GET /'
example.middleware = [didItThrow] // attach our middleware here, ...
async function example(context) {
  if (Math.random() > 0.5) {
    throw new Error('ow I stubbed my toe')
  }

  return 'everything went fine'
}
```

## Response Transforms

Boltzmann has useful defaults for mapping common return types to
HTTP semantics. All of these behaviors can be overridden using the
[Boltzmann symbols](#response-symbols). These transformations happen
between each layer of middleware, as well as between the last middleware
and the handler. The return value of `next(context)` will always
reflect these transformation.

### `"strings"`

_Added in 0.0.0_.

Strings will be turned into [`Buffer`] instances. If no
`content-type` header was specified, one will be generated and
set to `text/plain; charset=utf-8`.

**Example:**

```javascript
function isItABuffer() {
  return next => async context => {
    const result = await next(context)

    if (Buffer.isBuffer(result)) {
      console.log(`it's a buffer!`)
      console.log(String(result)) // "hello world"
    }

    return result
  }
}

example.route = 'GET /'
example.middleware = [isItABuffer] // attach our middleware here, ...
async function example(context) {
  return 'hello world'
}
```

### `undefined`, empty return

_Added in 0.0.0_.

Empty values will be turned into [`204 No Content`] responses.
They will be cast into empty [`Buffer`] instances.

**Example:**

```javascript
function isItABuffer() {
  return next => async context => {
    const result = await next(context)

    if (Buffer.isBuffer(result)) {
      console.log(result.length) // 0
    }

    return result
  }
}

example1.route = 'GET /'
example1.middleware = [isItABuffer] // attach our middleware here, ...
async function example1(context) {
  // no return
}

example2.route = 'GET /'
example2.middleware = [isItABuffer]
async function example2(context) {
  return // empty return
}

example3.route = 'GET /'
example3.middleware = [isItABuffer]
async function example3(context) {
  return undefined // or null, or "void <expr>"
}
```

### Node.JS Streams

_Added in 0.0.0_.

Returning a [`Readable`] Node stream is supported. Barring any modifications
by user-defined middleware, the stream will not be resumed until all middleware
has executed. It will be piped directly to the Node [`response`] object.

If no `content-type` header is present, it will be assigned a `content-type`
header value of `application/octet-stream`.

**Example:**

```javascript
const fs = require('fs')

example.route = 'GET /'
async function example(context) {
  return fs.createReadStream(__filename)
}
```

### JavaScript objects

_Added in 0.0.0_.

After all middleware has been executed, JavaScript object return
values will be converted to JSON automatically before being
written to the response stream. Note that this will call
`.toJSON()` on any member of that object tree.

If no `content-type` header is detected, one will be created and
assigned to `application/json; charset=utf-8`. If the object has
a [`Symbol.for('template')`] attribute defined & the
[`--templates`] flag is enabled, the content type will be set to
`text/html; charset=utf-8`.

**Example:**

```javascript
example.route = 'GET /'
async function example(context) {
  return {
    hello: 'world'
  } // responds with 200 OK; content-type: application/json; charset=utf-8.
    // response body will be `{"hello":"world"}`
}

class MyBusinessLogic {
  publicKnowledge = 'sure'
  secretInternalFacts = 'why not'

  // You can use toJSON() to control serialization of your object.
  // This is built into JSON.stringify()!
  toJSON () {
    const { secretInternalFacts: _, ...rest } = this
    return rest
  }
}
example2.route = 'GET /'
async function example2(context) {
  return new MyBusinessLogic()
}
```

#### Thrown exceptions

_Added in 0.0.0_.

Thrown exceptions are treated similarly to JavaScript objects. If no
status code was provided, they will be assigned a `500 Internal
Server Error` code.

In [development mode] the error `stack` will be returned. Any
other property, including `message`, will be forwarded from the
exception object to the response.

Notably **`toJSON()` will not be called on your exception object**.

**Example:**

```javascript
example.route = 'GET /'
async function example(context) {
  // in dev mode, you will see 500 Internal Server Error, content-type is application/json,
  // and the response body will be `{"message":"oh no","stack":"<stack info>"}`.
  // in production you will see `{"message":"oh no"}`.
  throw new Error("oh no")
}

class MyError {
  toJSON() {
    return {"foo": "bar"}
  }
}
example2.route = 'GET /'
async function example2(context) {
  // you will get `{"message":"wow"}`, NOT `{"foo":"bar"}` here.
  return new MyError("wow")
}
```

[development mode]: #TKTKTK
[culture]: https://en.wikipedia.org/wiki/Culture_series
["accepting user input"]: @/concepts/04-accepting-input.md
[Content negotiation]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Content_negotiation
[`accepts`]: https://github.com/jshttp/accepts
[HTTP Cookie]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies
[`Map`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map
[`cookie`]: https://github.com/jshttp/cookie#readme
[`Set-Cookie`]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie
[Request Headers]: https://developer.mozilla.org/en-US/docs/Glossary/Request_header
[Node.JS request headers object]: https://nodejs.org/api/http.html#http_message_headers
[`Host` request header]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Host
[`Symbol.for('template')`]: #symbol-for-template
[`--templates`]: @/reference/01-cli.md#templates
[template middleware]: @/reference/03-middleware.md#template
[HTTP verb]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods
[node request]: https://nodejs.org/api/http.html#http_event_request
[`--postgres`]: @/reference/01-cli.md#postgres
[unsafe HTTP methods]: https://developer.mozilla.org/en-US/docs/Glossary/safe
[`Promise`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
[`Client`]: https://node-postgres.com/api/client
["persisting data" chapter]: #TKTKTK
[`URLSearchParams`]: https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams
[`--redis`]: @/reference/01-cli.md#redis
[`handy-redis`]: https://github.com/mmkal/handy-redis#handy-redis
[`request.socket.remoteAddress`]: https://nodejs.org/api/net.html#net_socket_remoteaddress
[`Date.now()`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/now
[`URL`]: https://developer.mozilla.org/en-US/docs/Web/API/URL_API
[chapter on "handlers"]: @/concepts/01-handlers.md#responses
[symbols]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol
