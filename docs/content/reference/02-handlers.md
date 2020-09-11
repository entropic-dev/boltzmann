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

TKTKTK

### `method`
### `params`
### `postgresClient`
### `query`
### `redisClient`
### `remote`
### `start`
### `url`

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

