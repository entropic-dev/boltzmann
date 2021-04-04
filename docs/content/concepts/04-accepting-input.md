+++
title="Accepting input"
weight=4
slug="accepting-input"
+++

Many services require user input. Input comes in the form of route parameters,
query parameters, and HTTP request bodies. It's critical to enforce validation
on user input, but don't worry: Boltzmann has your back!

<!-- more -->

This document covers Boltzmann's affordances for accessing user input,
validating input, and sanitizing input. By the end of the document you
will know how to write custom body parsing functions.

## Accessing User Input

User input comes in three forms:

1. **Query or "search" parameters.** These are provided as part of the incoming
   URL, after the `?`. Generally query parameters are used to send
   safe-to-repeat requests, like page limits, object counts, or search facets.
   On the otherh hand, query parameters are not suitable for sending input to
   be used in object creation or operations that otherwise may have
   side-effects. Query parameters are available via [`context.query`].
2. **URL parameters.** These are also provided as part of the URL, _before_ the
   `?`. These match up with `:named` segments in the handler's route. URL
   parameters are generally used to select a particular resource. For example,
   your application might have a `/users/:name` handler which would match
   `/users/sam`; in this case the URL parameter `name` would have the value
   `"sam"`. URL parameters are available via [`context.params`].
3. **Body parameters.** Body parameters are created by interpreting the incoming
   HTTP request body. 

[`context.query`]: @/reference/02-handlers.md#query
[`context.params`]: @/reference/02-handlers.md#params
[`Context`]: @/concepts/01-handlers.md#Context

## Validating User Input

Boltzmann provides three validator decorators that rely on [the ajv schema
validator](https://github.com/epoberezkin/ajv) for you to enforce a schema for
your route parameters, query params, and body. The functions are:

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

The `boltzmann.decorators.params` function takes an ajv schema and generates a
decorator that applies the schema to any route params supplied.

## Writing Custom Body Parsers

Boltzmann provides and installs body parsers for
`application/x-www-form-urlencoded` and `application/json` request bodies by
default, but other formats can be supported by writing custom body parsers.

```typescript
type Parser  = (request: http.IncomingMessage) => any;
type Adaptor = (next: Parser) => Parser;
```


