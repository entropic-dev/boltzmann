+++
title="The context object"
weight=5
[taxonomies]
tags = ["reference"]
+++

Every route handler receives exactly one parameter: a context object. You should extend the context object with whatever data you find useful to preserve through the lifetime of a single request. <!-- more -->
The context exposes the following getters for data you're likely to find useful:

- `method`: the request method
- `headers`: the request headers
- `url`: the parsed request url
- `query`: the request query params, if any
- `params`: the request url params, if any
- `body`: a promise that resolves to the request body content
- `start`: timestamp in ms since the epoch of when the request started to be handled
- `accepts`: content-negotiation for the request, provided by [accepts](https://github.com/jshttp/accepts)
- `request`: the raw node request object
- `redisClient`: a [node-redis](https://github.com/NodeRedis/node-redis) client; present if you have enabled the redis feature
- `postgresClient`: a [node-postgres](https://github.com/brianc/node-postgres) client; present if you have enabled the postgresql feature

