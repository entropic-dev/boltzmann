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

## Getting started

For full Boltzmann docs, visit [the documentation site](https://www.boltzmann.dev/en/docs/v0.1.2/).

If you prefer to look at working example code, we've provided examples in the [`./examples`](https://github.com/entropic-dev/boltzmann/tree/latest/examples) directory of this repo.

To scaffold a new service with Boltzmann, run the `boltzmann` command-line tool. You can get it from [the releases page][https://github.com/entropic-dev/boltzmann/releases] or run it via `npx boltzmann-cli`. (We prebuild for Mac OS, Windows, and GNU Linuxes.) The tool is responsible for initializing a new Boltzmann project as well as keeping it up to date. You enable or disable specific Boltzmann features using the tool.

For example, to scaffold with the defaults:

```shell
projects|⇒ npx boltzmann-cli hello
```

A complete project is provided for you, with useful package run scripts and linting.

```shell
code|⇒ cd hello/
hello|⇒ ls -alF
.rw-r--r--  427 cj  7 Sep 17:15 .eslintrc.js
drwxr-xr-x    - cj  7 Sep 17:15 .github/
.rw-r--r--  136 cj  7 Sep 17:15 .prettierrc.js
.rwxr-xr-x  20k cj  7 Sep 17:15 boltzmann.js*
.rw-r--r--  262 cj  7 Sep 17:15 handlers.js
.rw-r--r-- 1.3k cj  7 Sep 17:15 middleware.js
drwxr-xr-x    - cj  7 Sep 17:15 node_modules/
.rw-r--r-- 155k cj  7 Sep 17:15 package-lock.json
.rw-r--r--  999 cj  7 Sep 17:15 package.json
```

To run: `./boltzmann.js`. And to view the response: `curl http://localhost:5000/hello/world`. Want to know more? [Check the docs!](https://www.boltzmann.dev/en/docs/v0.1.2/)

## Team

Boltzmann is a joint venture of [@ceejbot](https://github.com/ceejbot) and [@chrisdickinson](https://github.com/chrisdickinson).

## LICENCE

Apache-2.0.
