+++
title="Accepting input"
weight=4
slug="accepting-input"
+++

Route parameters, query parameters, body parsing, and validating them all.

<!-- more -->


Boltzmann provides three validator decorators that rely on [the ajv schema validator](https://github.com/epoberezkin/ajv) for you to enforce a schema for your route parameters, query params, and body.  <!-- more -->
The functions are:

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

TODO: body parsing.
