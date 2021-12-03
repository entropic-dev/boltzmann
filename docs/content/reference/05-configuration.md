+++
title="Environment variables"
slug="environment-variables"
weight=5
+++

Boltzmann's built-in features are configurable using environment variables.

<!-- more -->

Boltzmann's core features are configured using the following environment variables:

- `NODE_ENV`: dev(elopment), prod(uction), or test; consumed by [are-we-dev](https://github.com/chrisdickinson/are-we-dev)
- `LOG_LEVEL`: one of error, warn, info, debug; defaults to `debug`
- `PORT`: the port to listen on; defaults to 5000; boltzmann always binds `0.0.0.0`.
- `SERVICE_NAME`: the name of the service to advertise to Honeycomb and others; 
  falls back to the name of your package in package.json; this also appears in default logging

Boltzmann does not express any opinions about how you set environment variables. 
In development you can use [dotenv](https://github.com/motdotla/dotenv) with an 
invocation like this:

```shell
node -r dotenv/config ./boltzmann.js
```

Optional Boltzmann features are also configurable with either environment variables 
or config passed in when you attach their middleware to your app or handlers. 
Consult [the documentation for specific features](@/reference/03-middleware.md)
for details on how to configure them.
