+++
title="Environment variables"
weight=3
[taxonomies]
tags = ["reference"]
+++

Boltzmann's built-in features are configurable using environment variables.

<!-- more -->

Boltzmann respects the following environment variables out of the box:

- `NODE_ENV`: dev(elopment), prod(uction), or test; consumed by [are-we-dev](https://github.com/chrisdickinson/are-we-dev)
- `LOG_LEVEL`: one of error, warn, info, debug; defaults to `debug`
- `PORT`: the port to listen on; defaults to 5000; boltzmann always binds `0.0.0.0`.
- `DEV_LATENCY_ERROR_MS`: in dev mode, the length of time a middleware is allowed to run before it's treated as hung
- `DEV_LATENCY_WARNING_MS`: in dev mode, the length of time a middleware can run before you get a warning that it's slow
- `GIT_COMMIT`: a bit of text labeled as the git hash for the current running service; used by the optional status endpoint
- `HONEYCOMBIO_DATASET`: the name of your Honeycomb dataset, if you have enabled the feature
- `HONEYCOMBIO_WRITE_KEY`: a write key, if you have enabled the Honeycomb feature
- `PGURL` & `PGPOOLSIZE`: passed to the postgres pool constructor, if postgres is enabled
- `REDIS_URL`: passed to redis client constructor, if redis is enabled
- `SERVICE_NAME`: the name of the service to advertise to Honeycomb and others; falls back to the name of your package in package.json

The framework does not express any opinions about how this environment is set up. In development you can use [dotenv](https://github.com/motdotla/dotenv) with an invocation like this:

```shell
node -r dotenv/config ./boltzmann.js
```
