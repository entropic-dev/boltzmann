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
```

[`--redis`]: @/reference/01-cli.md#redis
[`@hapi/iron`]: https://github.com/hapijs/iron
[HTTP session support]: https://en.wikipedia.org/wiki/Session_(computer_science)#HTTP_session_token
[cookies]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies
["storage" chapter]: #TKTKTK

---

### Automatically installed middleware

#### `trace`

---

#### `handlePing`

---

#### `log`

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
