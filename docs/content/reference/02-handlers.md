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

[HTTP verb]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods
[node request]: https://nodejs.org/api/http.html#http_event_request

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

[`--postgres`]: @/reference/cli.md#postgres
[unsafe HTTP methods]: https://developer.mozilla.org/en-US/docs/Glossary/safe
[`Promise`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
[`Client`]: https://node-postgres.com/api/client
["persisting data" chapter]: #TKTKTK

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

[`URLSearchParams`]: https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams

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

[`--redis`]: @/reference/cli.md#redis
[`handy-redis`]: https://github.com/mmkal/handy-redis#handy-redis

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

[`request.socket.remoteAddress`]: https://nodejs.org/api/net.html#net_socket_remoteaddress

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

[`Date.now()`]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/now

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

[`URL`]: https://developer.mozilla.org/en-US/docs/Web/API/URL_API

## Response Symbols

### `Symbol.for('headers')`
### `Symbol.for('status')`
### `Symbol.for('template')`
### `Symbol.for('threw')`

## Response Transforms

### `"strings"`

### `undefined`, empty return

### Node.JS Streams

### JavaScript objects

#### Thrown errors

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

