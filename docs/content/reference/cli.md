+++
title="The scaffolding tool"
weight = 1
[taxonomies]
tags = ["concepts"]
+++

The Boltzmann CLI creates and updates a node project for you, with a boltzmann.js file created from a template to your specification, a package.json naming the required dependencies and some useful run scripts, and a linter configuration.

<!-- more -->

Running `npx boltzmann-cli --help` gives an overview of the command-line options. This document goes into more detail about them.

## Example usages

`npx boltzmann-cli web-server --redis --website`

Scaffolds a project in the directory `./web-server`, with the redis, csrf, and templating features enabled.

`npx boltzmann-cli api-server --githubci=off --honeycomb --jwt --postgres`

Scaffolds a project in `./api-server` with Honeycomb tracing integration, jwt parsing, and postgres client middleware. Turns off the default GitHubCI workflow feature.

## Feature-flipping

Passing `--feature=[on,off]` turns the named feature on or off. You can also enable a feature by mentioning it: `--feature` is equivalent to `--feature=on`.

You can rerun the boltzmann CLI in an existing project to update your copy of boltzmann or change which features you have enabled. The cli will respect the options you set earlier, and layer changes on top of this. To enable a feature, pass `--feature=on`.  For example, suppose you decide you need a redis client provided in middleware:

```shell
code|⇒ npx boltzmann-cli hello --redis=on
npx: installed 1 in 2.659s
Scaffolding a Boltzmann service in /Users/cj/code/hello
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
        adding handy-redis @ ^1.8.1 (redis activated)
        adding redis @ ^3.0.2 (redis activated)
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
Boltzmann at 0.1.2 with redis, githubci, status, ping
```

Pass `--feature=off` to remove a feature you have previously enabled. For example, if you decide you don't need redis after all:

```shell
code|⇒ npx boltzmann-cli hello --redis=off
npx: installed 1 in 0.809s
Scaffolding a Boltzmann service in /Users/cj/code/hello
    loaded settings from existing package.json
    writing boltzmann files...
    updating dependencies...
        removing handy-redis (redis deactivated)
        removing redis (redis deactivated)
    writing updated package.json...
    running package install...
Boltzmann at 0.1.2 with githubci, status, ping
```

Boltzmann will manage its dependencies when a feature is flipped on or off, but will not make other changes to an existing package.json. You are free to update its dependencies as you see best.

## Command-line flags

Boolean options:

- `all`: Enables all features. Added in version 0.1.3.
- `website`: Enable website feature set (templates, csrf). Added in version 0.1.3.
- `selftest`: Turns on features for testing Boltzmann while developing it.
- `docs`: Open the Boltzmann documentation in a web browser. Added in version 0.1.3.
- `force`: Update a git-repo destination even if there are changes.
- `silent`: Suppress all output except errors.
- `verbose`: Log even more. Pass -v or -vv to increase verbosity.
- `version`: Print version information.

Feature-flipping options:

- `csrf`: Enable csrf protection middleware.  Added in version 0.1.1.
- `githubci`: Enable GitHub actions CI; defaults to on.
- `honeycomb`: Enable [Honeycomb](https://www.honeycomb.io) tracing integration.
- `jwt`: Enable jwt middleware; defaults to on. Added in version 0.1.1.
- `ping`: Enable /monitor/ping liveness endpoint; defaults to on.
- `postgres`: Enable postgres middleware.
- `redis`: Enable redis middleware.
- `status`: Enable /monitor/status healthcheck endpoint; defaults to on.
- `templates`: Enable Nunjucks templates. Added in version 0.1.2.

The GitHub CI workflow, ping, and status features are enabled by default. All other features are disabled by default.

## Full usage

The current output of `npx boltzmann-cli help`:

```shell
boltzmann 0.1.2
Generate or update scaffolding for a Boltzmann service.
To enable a feature, mention it or set the option to `on`.
To remove a feature from an existing project, set it to `off`.

Examples:
boltzmann my-project --redis --website
boltzmann my-project --githubci=off --honeycomb --jwt

USAGE:
    boltzmann [FLAGS] [OPTIONS] [destination]

FLAGS:
        --all         Enable everything!
        --docs        Open the Boltzmann documentation in a web browser.
        --force       Update a git-repo destination even if there are changes
    -h, --help        Prints help information
        --selftest    Build for a self-test.
    -s, --silent      Suppress all output except errors.
    -V, --version     Prints version information
    -v, --verbose     Pass -v or -vv to increase verbosity
        --website     Enable website feature set (templates, csrf)

OPTIONS:
        --csrf <csrf>              Enable csrf protection middleware
        --githubci <githubci>      Enable GitHub actions CI
        --honeycomb <honeycomb>    Enable honeycomb
        --jwt <jwt>                Enable jwt middleware
        --ping <ping>              Enable /monitor/ping liveness endpoint; on by default
        --postgres <postgres>      Enable postgres
        --redis <redis>            Enable redis
        --status <status>          Enable /monitor/status healthcheck endpoint; on by default
        --templates <templates>    Enable Nunjucks templates

ARGS:
    <destination>    The path to the Boltzmann service [default: ]

```
