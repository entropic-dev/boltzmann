+++
title="Middleware"
weight=3
slug="middleware"
[taxonomies]
tags = ["reference"]
+++

This document covers the built-in middleware Boltzmann makes available. Some middleware is
automatically installed by Boltzmann when scaffolded with certain feature flags. Other middleware
you need to attach yourself, either to specific handlers or to your app.

<!-- more -->

## User-attached middleware

### `applyHeaders`

[To be documented.](https://github.com/entropic-dev/boltzmann/issues/68)

### `applyXFO`

The `applyXFO` middleware adds an
[X-Frame-Options header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options)
to responses. It accepts one configuration value, the value of the header to set. This value must
be one of `SAMEORIGIN` or `DENY`.

**Example usage:**

```javascript
'use strict'

const boltzmann = require('./boltzmann')

module.exports = {
  APP_MIDDLEWARE: [
    [boltzmann.middleware.applyXFO, 'DENY'],
  ],
}
```

* * *

### `authenticateJWT`

[To be documented.](https://github.com/entropic-dev/boltzmann/issues/68)

* * *

### `esbuild`

[To be documented.](https://github.com/entropic-dev/boltzmann/issues/63)

* * *

### `handleCORS`

The `handleCORS` middleware is always available to be attached. It configures headers to
control [Cross-Origin Resource Sharing](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS), or CORS.

**Arguments:**

-   `origins`: the origins that are permitted to request resources; sent in responses inn the
    `Access-Control-Allow-Origin` header value
-   `methods`: the allowed HTTP verbs; sent in responses in the `Access-Control-Allow-Methods` header
    value
-   `headers`: the custom headers the server will allow; sent in in responses in the
    `Access-Control-Allow-Headers` header value

**Example Usage:**

```javascript
const boltzmann = require('./boltzmann')
const isDev = require('are-we-dev')

module.exports = {
  APP_MIDDLEWARE: [
    [ boltzmann.middleware.handleCORS, {
      origins: isDev() ? '*' : [ 'www.example.com', 'another.example.com' ],
      methods: [ 'GET', 'POST', 'PATCH', 'PUT', 'DELETE' ],
      headers: [ 'Origin', 'Content-Type', 'Accept', 'Accept-Version', 'x-my-custom-header' ],
    } ],
  ],
}
```

* * *

### `oauth`

{{ changelog(version = "0.2.0") }}

This feature implements support for using [OAuth 2.0](https://oauth.net/2/) to authenticate a
user with an external service provider, such as Google or Auth0. Enabling the feature provides
four middlewares:

-   `handleOAuthLogin()`: Sets up a middleware to handle oauth login.
-   `handleOAuthCallback()`: Sets up a middleware that provides the callback url triggered by your OAuth provider after a successful login.
-   `handleOAuthLogout()`: Handles logging out an oauth-authenticated user. Unsets the key `userKey` in the user's session.
-   `oauth()`: This automatically attaches the above three middleware with identical config.

**Arguments:**

-   `domain`: **Required** either in the config object or in the env var `OAUTH_DOMAIN`. The
     fully-qualified domain name for the service providing authentication. For example,
     `my-domain.auth0.com`.
-   `secret`: **Required**. either in the config object or in the env var `OAUTH_CLIENT_SECRET`.
     Provided by your oauth service when you registered your application.
-   `clientId`: **Required** either in the config object or in the env var `OAUTH_CLIENT_ID`. Provided
     by your oauth service when you registered your application.
-   `userKey`: The key to delete from session storage on logout. A session key is _not set_ by
    middleware; you responsible for setting any session storage yourself. Defaults to `user`.
-   `callbackUrl`: A full URI, with protocol and domain. Read from the env var `OAUTH_CALLBACK_URL`;
    defaults to the uri `/callback` on your app.
-   `tokenUrl`: A full URI, with protocol and domain. Read from the env var `OAUTH_TOKEN_URL`;
    defaults to `https://${OAUTH_DOMAIN}/oauth/token`
-   `userinfoUrl`: A full URI, with protocol and domain. Read from the env var `OAUTH_USERINFO_URL`.
    If no value is provided, derived from the `domain` parameter as `https://${domain}/userinfo`
-   `authorizationUrl`: A full URI, with protocol and domain. Read from the env var
    `OAUTH_AUTHORIZATION_URL`; defaults to `https://${OAUTH_DOMAIN}/authorize`
-   `expiryLeewaySeconds`: Read from the env var `OAUTH_EXPIRY_LEEWAY`. Defaults to 60 seconds.
-   `defaultNextPath`: defaults to `/`
-   `logoutRoute`: defaults to `/logout`,
-   `returnTo`: A full URI, with protocol and domain. Read from the env var `OAUTH_LOGOUT_CALLBACK`;
    defaults to the uri `/` on your app.
-   `logoutUrl`: Read from the env var `AUTH_LOGOUT_URL`. Defaults to
    `https://${OAUTH_DOMAIN}/v2/logout`

The OAuth middleware has many configuration knobs and dials to turn, but the middleware is usable in
development if you set three environment variables: `OAUTH_DOMAIN`, `OAUTH_CLIENT_SECRET`, and
`OAUTH_CLIENT_ID`. If you set those variables, the code required to attach oauth middleware
looks like this:

```javascript
const { middleware } = require('./boltzmann')

// with process.env.{OAUTH_DOMAIN, OAUTH_CLIENT_SECRET, OAUTH_CLIENT_ID} all set
module.exports = {
  APP_MIDDLEWARE: [
    middleware.oauth
  ]
};
```

**Advanced configuration:**

If you have a more complex setup, the individual middlewares can be configured differently.
In each case, if you do not provide an optional configuration field, the default is determined
as documented above.

`handleOauthCallback()` respects the following configuration fields:

-   `authorizationUrl`
-   `callbackUrl`
-   `clientId`
-   `defaultNextPath`
-   `domain`
-   `expiryLeewaySeconds`
-   `secret`
-   `tokenUrl`
-   `userinfoUrl`
-   `userKey`

`handleOauthLogin()` respects the following configuration fields:

-   `audience`
-   `authorizationUrl`
-   `callbackUrl`
-   `clientId`
-   `connection_scope`
-   `connection`
-   `defaultNextPath`
-   `domain`
-   `login_hint`
-   `loginRoute`
-   `max_age`
-   `prompt`

`handleOauthLogin()` respects the following configuration fields:

-   `authorizationUrl`
-   `callbackUrl`
-   `clientId`
-   `defaultNextPath`
-   `domain`
-   `expiryLeewaySeconds`
-   `secret`
-   `tokenUrl`
-   `userinfoUrl`
-   `userKey`

* * *

### `route` {#route}

{{ changelog(version = "0.5.0") }}

[To be documented.](#TKTKTK)

* * *

### `session`

{{ changelog(version = "0.1.4") }}

You can import session middleware with `require('./boltzmann').middleware.session`. The session
middleware provides [HTTP session support] using sealed http-only [cookies]. You can read more about
Boltzmann's session support in the ["storage" chapter].

**Arguments:**

-   `secret`: **Required**. A 32-character string (or buffer) used to seal the client session id. Read
    from `process.env.SESSION_SECRET`.
-   `salt`: **Required**. A string or buffer used to salt the client session id before hashing it for lookup.
    Read from `process.env.SESSION_SALT`.
-   `load`: An async function taking `context` and an encoded `id` and returning a plain JavaScript object.
    Automatically provided if the [`--redis`] feature is enabled, otherwise **required**. Examples below.
-   `save`: An async function taking `context`, an encoded `id`, and a plain JavaScript object for storage.
    Automatically provided if the [`--redis`] feature is enabled, otherwise **required**. Examples below.
-   `cookie`: The name of the cookie to read the client session id from. Read from `process.env.SESSION_ID`.
-   `iron`: Extra options for [`@hapi/iron`], which is used to seal the client session id for transport in
    a cookie.
-   `expirySeconds`: The number of seconds until the cookie expires. Defaults to one year.
-   `cookieOptions`: An object containing options passed to the [`cookie`] package when serializing a session id.

**Example Usage:**

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

* * *

### `staticfiles`

[To be documented.](https://github.com/entropic-dev/boltzmann/issues/64)

* * *

### `template`

The `template` middleware is available if you have enabled the templating feature with
`--templates=on`.  It enables returning rendered [nunjucks](https://mozilla.github.io/nunjucks/)
templates from handlers. See the [website features overview](@/concepts/03-websites.md) for a
description of how to use templates to build websites and the development conveniences provided.

**Arguments:**

-   `paths`: an array of string paths where template files are looked up; defaults to `./templates`, a
    single directory relative to the application root.
-   `filters`: an object specifying [custom
    filters](https://mozilla.github.io/nunjucks/api#custom-filters) to add to the Nunjucks renderer.
    Object keys are filter names, and the values must be filter functions. Boltzmann enhances the default
    nunjucks behavior here, and allows you to register async functions as filters.
-   `tags`: [custom tags](https://mozilla.github.io/nunjucks/api#custom-tags) that extend the nunjucks
    renderer. Object keys are tag/extention names, and the values are the extention implementations.
-   `logger`: ; defaults to `bole('boltzmann:templates')`
-   `opts`: a [configuration object](https://mozilla.github.io/nunjucks/api.html#configure) passed to
    nunjucks. Defaults to the single setting `noCache`, which is set to true if the app is run in
    development mode, to support caching in production but live reloading in development.

* * *

### `templateContext`

The `template` middleware is available if you have enabled the templating feature with
`--templates=on`. It allows you to add extra data to every context value sent to template
rendering.

**Arguments:**

-   `extraContext`: An object specifying key/value pairs to add to the context. The keys are the name of the context value. The value can either be a static value or an optionally asynchronous function returning a value.

**Example Usage:**

```javascript
const boltzmann = require('./boltzmann')
async function fetchActiveUsers(context) {
  // do something with i/o here
}

module.exports = {
  APP_MIDDLEWARE: [
    [
      boltzmann.middleware.applyCSRF,
      [ boltzmann.middleware.templateContext, {
        siteTitle: 'Boltzmann User Conference',
        activeUsers: fetchActiveUsers
      } ],
      boltzmann.middleware.template,
    ],
  ],
}
```

* * *

### `test`

[To be documented](#TKTKTK)

* * *

### `validate.body`

{% changelog(version="0.0.0") %}
- **Changed in 0.1.7:** Bugfix to support validator use as middleware.
- **Changed in 0.2.0:** Added support for schemas defined via [`fluent-json-schema`].
- **Changed in 0.5.0:** Added second options argument, accepting [`ajv`].
{% end %}

The `validate.body` middleware applies [JSON schema] validation to incoming
request bodies. It intercepts the body that would be returned by
[`context.body`] and validates it against the given schema, throwing a `400 Bad
Request` error on validation failure. If the body passes validation it is
passed through.

`Ajv` is configured with `{useDefaults: true, allErrors: true}` by default. In
development mode, `strictTypes` is set to `true`. In non-development mode,
it is set to `"log"`.

**Arguments:**

`validate.body(schema[, { ajv }])`

- `schema`: Positional. A [JSON schema] object defining valid input.
- `options`: Positional.
    - `ajv`: Named. Optionally provide a custom instance of [`ajv`].

**Example Usage:**

```js
// handlers.js
const { middleware } = require('boltzmann')

example.middleware = [
  [middleware.validate.body, {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' }
    }
  }]
]
example.route = 'POST /example'
export async function example (context) {
  // if body.id isn't a uuid, this throws a 400 Bad request error,
  // otherwise `id` is a string containing a uuid:
  const { id } = await context.body
}

const Ajv = require('ajv')
customAjv.middleware = [
  [middleware.validate.body, {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' }
    }
  }, {
    // You can customize Ajv behavior by providing your own Ajv
    // instance, like so:
    ajv: new Ajv({
      coerceTypes: true
    })
  }]
]
customAjv.route = 'POST /custom'
export async function customAjv (context) {
  // if body.id isn't a uuid, this throws a 400 Bad request error,
  // otherwise `id` is a string containing a uuid:
  const { id } = await context.body
}
```

* * *

### `validate.params`

{% changelog(version="0.0.0") %}
- **Changed in 0.1.7:** Bugfix to support validator use as middleware.
- **Changed in 0.2.0:** Added support for schemas defined via [`fluent-json-schema`].
- **Changed in 0.5.0:** Added second options argument, accepting `ajv`.
{% end %}

The `validate.params` middleware applies [JSON schema] validation to url
parameters matched during request routing. Matched URL parameters are validated
against the given schema, throwing a `400 Bad Request` error on validation
failure, preventing execution of the handler. If the parameters pass validation
the handler is called.

`Ajv` is configured with `{allErrors: true, useDefaults: true, coerceTypes:
"array"}` by default. In development mode, `strictTypes` is set to `true`.
In non-development mode, it is set to `"log"`.

**Arguments:**

`validate.params(schema[, { ajv }])`

- `schema`: Positional. A [JSON schema] object defining valid input.
- `options`: Positional.
    - `ajv`: Named. Optionally provide a custom instance of [`ajv`].

**Example Usage:**

```js
// handlers.js
const { middleware } = require('boltzmann')

example.middleware = [
  [middleware.validate.params, {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' }
    }
  }]
]
example.route = 'GET /example/:id'
export async function example (context) {
  const { id } = context.params
}

const Ajv = require('ajv')
customAjv.middleware = [
  [middleware.validate.params, {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' }
    }
  }, {
    // You can customize Ajv behavior by providing your own Ajv
    // instance, like so:
    ajv: new Ajv({
      coerceTypes: true
    })
  }]
]
customAjv.route = 'GET /:id'
export async function customAjv (context) {
  const { id } = context.params
}
```

* * *

### `validate.query`

{% changelog(version="0.0.0") %}
- **Changed in 0.1.7:** Bugfix to support validator use as middleware.
- **Changed in 0.2.0:** Added support for schemas defined via [`fluent-json-schema`].
- **Changed in 0.5.0:** Added second options argument, accepting `ajv`.
{% end %}

The `validate.query` middleware applies [JSON schema] validation to incoming
HTTP query (or "search") parameters. Query parameters are validated against the
given schema, throwing a `400 Bad Request` error on validation failure,
preventing execution of the handler. If the query parameters pass validation the
handler is called.

`Ajv` is configured with `{allErrors: true, useDefaults: true, coerceTypes:
"array"}` by default. In development mode, `strictTypes` is set to `true`.
In non-development mode, it is set to `"log"`.

**Arguments:**

`validate.query(schema[, { ajv }])`

- `schema`: Positional. A [JSON schema] object defining valid input.
- `options`: Positional.
    - `ajv`: Named. Optionally provide a custom instance of [`ajv`].

**Example Usage:**

```js
// handlers.js
const { middleware } = require('boltzmann')

example.middleware = [
  [middleware.validate.query, {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' }
    }
  }]
]
example.route = 'GET /example'
export async function example (context) {
  const { id } = context.query
}

const Ajv = require('ajv')
customAjv.middleware = [
  [middleware.validate.query, {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' }
    }
  }, {
    // You can customize Ajv behavior by providing your own Ajv
    // instance, like so:
    ajv: new Ajv({
      coerceTypes: true
    })
  }]
]
customAjv.route = 'GET /custom'
export async function customAjv (context) {
  const { id } = context.query
}
```

[JSON schema]: https://json-schema.org/
[`fluent-json-schema`]: https://www.npmjs.com/package/fluent-json-schema
[`ajv`]: https://ajv.js.org/

* * *

### `vary`

{{ changelog(version="0.5.0") }}

The `vary` middleware unconditionally updates responses to include a [`Vary`]
header with the configured values. This is useful for handlers that change
behavior based on `context.cookie`. It is automatically installed for handlers
that use the [`.version` attribute].

[`.version` attribute]: @/reference/02-handlers.md#version

**Arguments:**

- `on`: A string or list of strings, representing `Vary` values.

**Example Usage:**

```js
// handlers.js
const { middleware } = require('./boltzmann.js')
cookies.middleware = [
  [middleware.vary, 'cookie']
]
cookies.route = 'GET /'
export function cookies(context) {
  return context.cookie.get('wow') ? 'great' : 'not great'
}

// multiple values may be set at once.
multi.middleware = [
  [middleware.vary, ['cookie', 'accept-encoding']]
]
multi.route = 'GET /multi'
export function multi(context) {
  return context.cookie.get('wow') ? 'great' : 'not great'
}
```

[`Vary`]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Vary

* * *

## Automatically attached middleware

Automatically-attached middleware is middleware you can configure but do _not_ need to attach to
the app yourself. Boltzmann automatically attaches these middlewares if the features that provide
them are enabled. You can often configure this middleware, however, using environment variables.

### `attachPostgres`

This middleware is enabled when the [postgres feature](@/reference/01-cli.md#postgres) is enabled.
It creates a postgres client and makes it available on the context object via an async getter. To use it:

```js
const client = await context.postgresClient
```

Configure the postgres client with these two environment variables:

-   `PGURL`: the URI of the database to connect to; defaults to
    `postgres://postgres@localhost:5432/${process.env.SERVICE_NAME}`
-   `PGPOOLSIZE`: the maximum number of connections to make in the connection pool; defaults to 20

* * *

### `attachRedis`

This middleware is attached when the [redis feature](@/reference/01-cli.md#redis) is enabled.
It adds a configured, promisified Redis client to the context object accessible via the
getter `context.redisClient`. This object is a [handy-redis](https://github.com/mmkal/handy-redis)
client with a promisified API. The environment variable `REDIS_URL` is passed to the handy-redis
constructor.

* * *

### `devMiddleware`

This middleware is attached when Boltzmann runs in development mode. It provides stall and hang
timers to aid in detecting and debugging slow middleware.

You can configure what slow means in your use case by setting these two environment variables:

-   `DEV_LATENCY_ERROR_MS`: the length of time a middleware is allowed to run before it's treated as
    hung, in milliseconds
-   `DEV_LATENCY_WARNING_MS`: the length of time a middleware can run before you get a warning that
    it's slow, in milliseconds

This middleware does nothing if your app is not in development mode.

* * *

### `handlePing`

This middleware adds a handler at `GET /monitor/ping`. It responds with a short text string that is
selected randomly at process start. This endpoint is intended to be called often by load balancers
or other automated processes that check if the process is listening. No other middleware is invoked
for this endpoint. In particular, it is _not_ logged.

* * *

### `handleStatus`

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

* * *

### `livereload`

[To be documented.](https://github.com/entropic-dev/boltzmann/issues/65)

* * *

### `log`

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
field. This is set by examining headers for an existing id. Boltzmann consults `x-honeycomb-trace`,
`x-request-id` and `traceparent` before falling back to generating a request id using a short
randomly-selected string.

To log from your handlers, you might write code like this:

```js
const logger = require('bole')('handlers')

async function greeting(/** @type {Context} */ context) {
    logger.info(`extending a hearty welcome to ${context.params.name}`)
    return `hello ${context.params.name}`
}
```

* * *

### `route` {#auto-route}

{{ changelog(version = "0.5.0") }}

Boltzmann automatically attaches one instance of [`route`](#route).

[To be documented.](#TKTKTK)

* * *

### `trace`

{% changelog(version="0.0.0") %}
- **Changed in 0.6.0:** Tracing now uses OpenTelemetry if any `OTEL_*` environment
variable is defined
{% end %}

This middleware is added to your service if you have enabled the `honeycomb` feature.
This feature sends trace data to the [Honeycomb](https://www.honeycomb.io) service for
deep observability of the performance of your handlers.

To configure this middleware for [beeline](https://www.npmjs.com/package/honeycomb-beeline) 
tracing, set the following environment variables:

-   `HONEYCOMB_API_HOST`: (optional) the honeycomb API endpoint to use - defaults to localhost
-   `HONEYCOMB_WRITEKEY`: the honeycomb API key to use - required to enable beeline tracing
-   `HONEYCOMB_DATASET`: the name of the dataset to send trace data to - defaults to `nodejs`
-   `HONEYCOMB_TEAM`: (optional) set this to enable links to traces from development error reporting
-   `HONEYCOMB_SAMPLE_RATE`: (optional) passed to `honeycomb-beeline` to set the sampling rate for events - defaults to 1

The honeycomb middleware also supports
[OpenTelemetry](https://opentelemetry.io/docs/instrumentation/js/getting-started/nodejs/)
tracing over [the OTLP http/protobuf protocol](https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/protocol/otlp.md).
This is enabled if any `OTEL_*` environment variables are defined.

OpenTelemetry supports many, many environment variables - they document both
[common SDK environment variables](https://opentelemetry.io/docs/reference/specification/sdk-environment-variables/)
and [OTLP exporter-specific environment variables](https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/protocol/exporter.md),
and it's worth perusing all of them. However, if you are in a rush:

- `HONEYCOMB_WRITEKEY`: this is still used in an OpenTelemetry configuration
- `HONEYCOMB_DATASET`: this is also still used in an OpenTelemetry configuration
- `OTEL_EXPORTER_OTLP_ENDPOINT`: the API endpoint - i.e. `https://api.honeycomb.io`, or your [refinery](https://docs.honeycomb.io/manage-data-volume/refinery/) instance if using one

In you really, really want to use the default OpenTelemetry configuration,
you can set `OTEL_ENABLE=1` - this isn't meaningful for the OpenTelemetry SDKs
or OTLP exporters but will trigger the enabling of OpenTelemetry in boltzmann.

Note that OpenTelemetry tracing, while intended for use with Honeycomb, may be
used with any OTLP tracing backend. You can do this by foregoing the setting of
`HONEYCOMB_WRITEKEY` and setting `OTEL_EXPORTER_OTLP_HEADERS` to contain the
alternate headers for your backend.

* * *
