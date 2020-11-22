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

You can import session middleware with `require('./boltzmann').middleware.session`. The session middleware
provides [HTTP session support] using sealed http-only [cookies]. You can read more about Boltzmann's session
support in the ["storage" chapter].

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

#### `oauth`

_Added in 0.2.0_.

This middleware implements support for using [OAuth 2.0](https://oauth.net/2/) to authenticate a
user with an external service provider, such as Google or Auth0.

**Arguments**:

- `domain`: **Required**. Falls back to the env var `OAUTH_DOMAIN`.
- `secret`: **Required**. Falls back to the env var `OAUTH_CLIENT_SECRET`.
- `clientId`: **Required**. Falls back to the env var `OAUTH_CLIENT_ID`.
- `userKey`: The key to delete from session storage on logout. A session key is *not set* by
  middleware; you responsible for setting any session storage yourself. Defaults to `user`.
- `callbackUrl`: A full URI, with protocol and domain. Read from the env var `OAUTH_CALLBACK_URL`;
  defaults to the uri `/callback` on your app.
- `tokenUrl`: A full URI, with protocol and domain. Read from the env var `OAUTH_TOKEN_URL`;
  defaults to `https://${OAUTH_DOMAIN}/oauth/token`
- `userinfoUrl`: A full URI, with protocol and domain. Read from the env var `OAUTH_USERINFO_URL`;
  defaults to `https://${OAUTH_DOMAIN}/userinfo`
- `authorizationUrl`: A full URI, with protocol and domain. Read from the env var
  `OAUTH_AUTHORIZATION_URL`; defaults to `https://${OAUTH_DOMAIN}/authorize`
- `expiryLeewaySeconds`: Read from the env var `OAUTH_EXPIRY_LEEWAY`. Defaults to 60 seconds.
- `defaultNextPath`: defaults to `/`
- `logoutRoute`: defaults to `/logout`,
- `returnTo`: A full URI, with protocol and domain. Read from the env var `OAUTH_LOGOUT_CALLBACK`;
  defaults to the uri `/` on your app.
- `logoutUrl`: Read from the env var `AUTH_LOGOUT_URL`. Defaults to
  `https://${OAUTH_DOMAIN}/v2/logout`

The OAuth middleware has many configuration knobs and dials to turn, but the middleware is usable in
development if you set three environment variables: `OAUTH_DOMAIN`, `OAUTH_CLIENT_SECRET`, and
`OAUTH_CLIENT_ID`. If you set those variables, the code required to attach oauth middleware
looks like this:

```javascript
const { middleware } = require('./boltzmann')

module.exports = {
  APP_MIDDLEWARE: [
    middleware.oauth
  ]
};
```

To run in production, you will want to set the

```js
const { middleware } = require('./boltzmann');

module.exports = {
  APP_MIDDLEWARE: [
    [ middleware.oauth, {
      domain: ,
      secret: ,
      clientId: ,
      callbackUrl: ,
      returnTo: ,
    }
  ]
};
```

---

### Automatically attached middleware

Automatically-attached middleware is middleware you can configure but do *not* need to attach to
the app yourself. Boltzmann automatically attaches these middlewares if the features that provide
them are enabled. You can often configure this middleware, however, using environment variables.

#### `trace`

This middleware is added to your service if you have enabled the `honeycomb` feature.
This feature sends trace data to the [Honeycomb](https://www.honeycomb.io) service for
deep observability of theperformance of your handlers.

To configure this middleware, set the following environment variables:

- `HONEYCOMBIO_WRITE_KEY`: the honeycomb API key to use; required to enable tracing
- `HONEYCOMBIO_DATASET`: the name of the dataset to send trace data to; required to enable tracing
- `HONEYCOMBIO_TEAM`: optional; set this to enable links to traces from error reporting
- `HONEYCOMBIO_SAMPLE_RATE`: optional; passed to `honeycomb-beeline` to set the sampling rate for events
- `HONEYCOMB_SAMPLE_RATE`: optional; consulted if `HONEYCOMBIO_SAMPLE_RATE` is not present

The sampling rate defaults to 1 if neither sample rate env var is set. Tracing is
disabled if a write key and dataset are not provided; the middleware is still
attached but does nothing in this case.

---

#### `handlePing`

This middleware adds a handler at `GET /monitor/ping`. It responds with a short text string that is
selected randomly at process start. This endpoint is intended to be called often by load balancers
or other automated processes that check if the process is listening. No other middleware is invoked
for this endpoint. In particular, it is *not* logged.

---

#### `log`

This middleware is always attached to Boltzmann apps.

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
const logger = require('bole')('handlers')

async function greeting(/** @type {Context} */ context) {
    logger.info(`extending a hearty welcome to ${context.params.name}`)
    return `hello ${context.params.name}`
}
```

---

#### `attachRedis`

This middleware is attached when the [redis feature](@/reference/01-cli.md#redis) is enabled.
It adds a configured, promisified Redis client to the context object accessible via the
getter `context.redisClient`. This object is a [handy-redis](https://github.com/mmkal/handy-redis)
client with a promisified API. The environment variable `REDIS_URL` is passed to the handy-redis
constructor.

---

#### `attachPostgres`

This middleware is enabled when the [postgres feature](@/reference/01-cli.md#postgres) is enabled.
It creates a postgres client and makes it available on the context object via an async getter. To use it:

```js
const client = await context.postgresClient
```

Configure the postgres client with these two environment variables:

- `PGURL`: the URI of the database to connect to; defaults to
  `postgres://postgres@localhost:5432/${process.env.SERVICE_NAME}`
- `PGPOOLSIZE`: the maximum number of connections to make in the connection pool; defaults to 20

---

#### `handleStatus`

This middleware is attached when the [status feature](@/reference/01-cli.md#status) is enabled. It
mounts a handler at `GET /monitor/status` that includes helpful information about the process status
and the results of the reachability checks added by the redis and postgres features, if those are
also enabled. The response is a single json object, like this one:

```json
{
    "downstream": {
        "redisReachability": {
            "error": null,
            "latency": 1,
            "status": "healthy"
        }
    },
    "hostname": "catnip.local",
    "memory": {
        "arrayBuffers": 58703,
        "external": 1522825,
        "heapTotal": 7008256,
        "heapUsed": 5384288,
        "rss": 29138944
    },
    "service": "hello",
    "stats": {
        "requestCount": 3,
        "statuses": {
            "200": 2,
            "404": 1
        }
    },
    "uptime": 196.845680345
}
```

This endpoint uses the value of the environment variable `GIT_COMMIT`, if set, to populate the `git` field of this response structure. Set this if you find it useful to identify which commit identifies the build a specific process is running.

If you have enabled this endpoint, you might wish to make sure it is not externally accessible. A common way of doing this is to block routes that match `/monitor/` in external-facing proxies or load balancers.

---

#### `devMiddleware`

This middleware is attached when Boltzmann runs in development mode. It provides stall and hang timers
to aid in detecting and debugging slow middleware.

You can configure what slow means in your use case by setting these two environment variables

- `DEV_LATENCY_ERROR_MS`: the length of time a middleware is allowed to run before it's treated as hung, in milliseconds
- `DEV_LATENCY_WARNING_MS`: the length of time a middleware can run before you get a warning that it's slow, in milliseconds

This middleware does nothing if your app is not in development mode.

---
