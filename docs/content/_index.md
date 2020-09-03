+++
weight = 1
title = "Boltzmann"
description = "Introduction to Boltzmann"
sort_by = "weight"
+++

# Boltzmann: an introduction

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

<!-- more -->

To get started with Boltzmann, run the `boltzmann` command-line tool. You can get it from [the releases page][https://github.com/entropic-dev/boltzmann/releases] or run it via `npx boltzmann-cli`. The tool is responsible for initializing a new Boltzmann project as well as keeping it up to date. You enable or disable specific Boltzmann features using the tool.

For example, to scaffold with the defaults:

```shell
projects|⇒ npx boltzmann-cli ./hello
npx: installed 1 in 1.511s
Scaffolding a Boltzmann service in ./hello
    initializing a new NPM package...
    writing boltzmann files...
    updating dependencies...
        adding are-we-dev @ ^1.0.0
        adding culture-ships @ ^1.0.0
        adding find-my-way @ ^2.2.1
        adding bole @ ^4.0.0
        adding ajv @ ^6.12.2
        adding dotenv @ ^8.2.0
        adding accepts @ ^1.3.7
        adding cookie @ ^0.4.1
        adding tap @ ^14.10.7 (dev)
        adding @hapi/shot @ ^4.1.2 (dev)
        adding bistre @ ^1.0.1 (dev)
        adding eslint @ ^7.1.0 (dev)
        adding @typescript-eslint/parser @ ^3.1.0 (dev)
        adding @typescript-eslint/eslint-plugin @ ^3.1.0 (dev)
        adding eslint-config-prettier @ ^6.11.0 (dev)
        adding eslint-plugin-prettier @ ^3.1.3 (dev)
        adding prettier @ ^2.0.5 (dev)
    writing updated package.json...
    running package install...
Boltzmann at 0.1.1 with githubci, status, ping
```

A complete Boltzmann hello world is provided for you.

```shell
hello|⇒ ls
boltzmann.js*  handlers.js  middleware.js  node_modules/  package-lock.json  package.json
```

Take a look at `handlers.js`:

```js
import { Context } from './boltzmann.js' // optionally pull in typescript definition

greeting.route = 'GET /hello/:name'
export async function greeting(/** @type {Context} */ context) {
    return `hello ${context.params.name}`
}

module.exports = {
  greeting
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

## The Boltzmann API

If you prefer to look at working example code, we've provided examples in the [`./examples`](https://github.com/entropic-dev/boltzmann/tree/latest/examples) directory of this repo.
