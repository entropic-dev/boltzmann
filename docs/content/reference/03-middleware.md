+++
title="Middleware"
weight=3
slug="middleware"
[taxonomies]
tags = ["reference"]
+++

This document covers the built-in middleware Boltzmann makes available. Some
middleware is automatically installed by Boltzmann when scaffolded with certain
feature flags.

<!-- more -->


### User-configurable middleware

#### `authenticateJWT`

---

#### `template`

---

#### `handleCORS`

---

#### `applyXFO`

---

#### `session`

_Added in 0.1.4_.

**Arguments**:

- `secret`: **Required**. A 32-character string (or buffer) used to seal the client session id. Read
  from `process.env.SESSION_SECRET`.
- `salt`: **Required**. A string or buffer used to salt the client session id before hashing it for lookup.
  Read from `process.env.SESSION_SALT`.
- `load`: An async function taking `context` and an encoded `id` and returning a plain JavaScript object.
  Automatically provided if the [`--redis`] feature is enabled, otherwise **required**. Examples below.
- `save`: An async function taking `context`, an encoded `id`, and a plain JavaScript object for storage.
  Automatically provided if the [`--redis`] feature is enabled, otherwise **required**. Examples below.
- `cookie`: The name of the cookie to read the client session id from. Read from `process.env.SESSION_ID`.
- `iron`: Extra options for [`@hapi/iron`], which is used to seal the client session id for transport in
  a cookie.
- `expirySeconds`: The number of seconds until the cookie expires. Defaults to one year.
- `cookieOptions`: An object containing options passed to the [`cookie`] package when serializing a session id.

You can import session middleware with `require('./boltzmann').middleware.session`. The session middleware
provides [HTTP session support] using sealed http-only [cookies]. You can read more about Boltzmann's session
support in the ["storage" chapter].

**Example Configurations:**

```javascript
const { middleware } = require('./boltzmann')

// The most basic configuration. Relies on environment variables being set for required values.
// Consider using this!
module.exports = {
  APP_MIDDLEWARE: [
    middleware.session
  ]
};

// A simple configuration, hard-coding the values. Don't actually do this.
module.exports = {
  APP_MIDDLEWARE: [
    [middleware.session, { secret: 'wow a great secret, just amazing'.repeat(2), salt: 'salty' }],
  ]
};

// A complicated example, where you store sessions on the filesystem, because
// the filesystem is a database.
const fs = require('fs').promise
module.exports = {
  APP_MIDDLEWARE: [
    [middleware.session, {
      async save (_context, id, data) {
        // We receive "_context" in case there are any clients we wish to use
        // to save or load our data. In this case, we're using the filesystem,
        // so we can ignore the context.
        return await fs.writeFile(id, 'utf8', JSON.stringify(id))
      },
      async load (_context, id) {
        return JSON.parse(await fs.readFile(id, 'utf8'))
      }
    }]
  ]
}

module.exports = {
  // A configuration that sets "same-site" to "lax", suitable for sites that require cookies
  // to be sent when redirecting from an external site. E.g., sites that use OAuth-style login
  // flows.
  APP_MIDDLEWARE: [
    [middleware.session, { cookieOptions: { sameSite: 'lax' } }],
  ]
};
```

[`--redis`]: @/reference/01-cli.md#redis
[`@hapi/iron`]: https://github.com/hapijs/iron
[HTTP session support]: https://en.wikipedia.org/wiki/Session_(computer_science)#HTTP_session_token
[cookies]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies
["storage" chapter]: #TKTKTK
[`cookie`]: https://www.npmjs.com/package/cookie#options-1

---

### Automatically installed middleware

#### `trace`

This middleware is added to your service if you have enabled the `honeycomb` feature.
This feature sends trace data to the [Honeycomb](https://www.honeycomb.io) service for
deep observability of performance of your handlers.

To configure this middleware, set the following environment variables:

- `HONEYCOMBIO_WRITE_KEY`: the honeycomb API key to use
- `HONEYCOMBIO_DATASET`: the name of the dataset to send trace data to
- `HONEYCOMBIO_TEAM`: optional; set this to enable links to traces from error reporting

---

#### `handlePing`

This middleware adds a handler at `GET /monitor/ping`. It responds with a short text string that is
selected randomly at process start. This endpoint is intended to be called often by load balancers
or other automated processes that check if the process is listening. No other middleware is invoked
for this endpoint. In particular, it is *not* logged.

---

#### `log`

This middleware configures the [bole](https://github.com/rvagg/bole) logger and enables per-request
logging. In development mode, the logger is configured using
[bistre](https://github.com/hughsk/bistre) pretty-printing. In production mode, the output is
newline-delimited json.

To configure the log level, set the environment variable `LOG_LEVEL` to a level that bole supports.
The default level is `debug`. To tag your logs with a specific name, set the environment variable
`SERVICE_NAME`. The default name is `boltzmann`.

Here is an example of the request logging:

```shell
> env SERVICE_NAME=hello NODE_ENV=production ./boltzmann.js
{"time":"2020-11-16T23:28:58.104Z","hostname":"catnip.local","pid":19186,"level":"info","name":"server","message":"now listening on port 5000"}
{"time":"2020-11-16T23:29:02.375Z","hostname":"catnip.local","pid":19186,"level":"info","name":"hello","message":"200 GET /hello/world","id":"GSV Total Internal Reflection","ip":"::1","host":"localhost","method":"GET","url":"/hello/world","elapsed":1,"status":200,"userAgent":"HTTPie/2.3.0"}
```

The `id` fields in logs is the value of the request-id, available on the context object as the `id`
field. This is set by examining headers for an existing id. Boltzmann consults `x-honeycomb-trace`
and `x-request-id` before falling back to generating a request id using a short randomly-selected
string.

To log from your handlers, you might write code like this:

```js
async function greeting(/** @type {Context} */ context) {
    const logger = require('bole')('greeting')
    logger.info(`giving a hearty welcome to ${context.params.name}`)
    return `hello ${context.params.name}`
}
```



---

#### `attachRedis`

---

#### `attachPostgres`

---

#### `handleStatus`

---

#### `devMiddleware`

---

#### `honeycombMiddlewareSpans`

---

#### `enforceInvariants`

---
