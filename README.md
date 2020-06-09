# boltzmann

![Build Boltzmann CLI](https://github.com/entropic-dev/boltzmann/workflows/Build%20Boltzmann%20CLI/badge.svg)
![Test Boltzmann CLI & framework](https://github.com/entropic-dev/boltzmann/workflows/Test%20Boltzmann%20CLI%20&%20framework/badge.svg)

Boltzmann is a JavaScript framework for writing web servers. It is implemented in a single file that lives alongside your code. Boltzmann is focused on delivering a great developer experience and makes its tradeoffs with that goal in mind.

Our design goals:

- Make all return values from route handlers and middlewares be valid responses, mapping to http semantics.
- Prefer zero-cost abstractions: pay for what you use and nothing more, including in installation and startup time.
- Use global types, no special response types.
- Only modify objects we provide; do not rely on modifications to node's request & response objects.
- Provide pluggable behavior for body-parsing and middleware, with good defaults.
- Use only minimal, well-vetted dependencies.
- Bake in observability (optionally), via [Honeycomb](https://honeycomb.io) tracing.
- Rely on a little bit of documented convention to avoid configuration.
- Making throwing Boltzmann away if you need to move on _possible_.

Boltzmann provides Typescript definitions for its exports, for your development convenience, but it does not require you to opt-in to Typescript or do any transpilation. We'd like you to be able to run Boltzmann apps under deno or in a web worker some day, so we make API choices that move us toward that goal.

Who's the "we" in this document? @ceejbot and @chrisdickinson.

## Hello world

To get started with Boltzmann, download the `boltzmann` command-line tool. You can get it from [the releases page][https://github.com/entropic-dev/boltzmann/releases] or run it via `npx boltzmann-cli`. The tool is responsible for initializing a new Boltzmann project as well as keeping it up to date. You enable or disable specific Boltzmann features using the tool.

For example, to scaffold with the defaults:

```sh
npx boltzmann-cli ./hello
cd hello
npm install
```

A complete Boltzmann hello world is provided for you:

```js
// handlers.js, in the same directory as boltzmann.js
import { Context } from './boltzmann.js' // optionally pull in typescript definition

greeting.route = 'GET /hello/:name'
export async function greeting(/** @type {Context} */ context) {
    return `hello ${context.params.name}`
}
```

To run: `./boltzmann.js`. And to view the response: `curl http://localhost:5000/hello/world`

## Creating a boltzmann app

This repo includes a command-line tool, `boltzmann`, that generates a single javascript file with all of Boltzmann's implementation, and some scaffolding for a full Boltzmann app if it's not already present. The tool enables or disables specific Boltzmann features. The tool is safe to re-run, provided you are running it in a versioned git directory.

To scaffold with redis and honeycomb:

```sh
npx boltzmann-cli --postgres --honeycomb todo-api
```

This creates a new project in `./todo-api` with postgres and Honeycomb integration enabled. If it finds existing code in `./todo-api`, it updates `boltzmann.js`.

The scaffold currently assumes you're using node as your runtime and NPM as your package manager. It installs its dependencies for you, at the versions it needs. From this moment on, both boltzmann and its dependencies are under your management. Boltzmann is in your app repo as a *source file*, not as a dependency. You are free to make changes to the Boltzmann file, but be aware the scaffolding tool won't respect your changes if you run it again to update. You are also free to update or pin Boltzmann's dependencies.

If you need to change Boltzmann's core behavior, you can either re-run the command-line tool to change features *or* write your own middleware. You'll be writing your own middleware for any reasonably complex project anyway!

## Features

Here are the features you can enable or disable at the command-line:

- ping: respond to `GET /ping` with a short text message; on by default
- status: respond to `GET /status` with a JSON object with process information; off by default
- postgres: provide a postgres client via middleware; off by default
- redis: provide a redis client via middleware; off by default
- honeycomb: send trace data to honeycomb for each response, with a span for each middleware executed

If this documentation lags reality, `npx boltzmann-cli --help` is a definitive source of truth.

## The Boltzmann API

If you prefer to look at working example code, we've provided examples in the [`./examples`](https://github.com/entropic-dev/boltzmann/tree/latest/examples) directory of this repo.


## LICENCE

Apache-2.0.
