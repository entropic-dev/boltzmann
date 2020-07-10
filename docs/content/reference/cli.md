+++
title="The scaffolding tool"
weight = 1
[taxonomies]
tags = ["concepts"]
+++

The Boltzmann CLI creates and updates a node project for you, with a boltzmann.js file created from a template to your specification, a package.json naming the required dependencies and some useful run scripts, and a linter configuration.

<!-- more -->

Boltzmann will manage its dependencies when a feature is flipped on or off, but will not make other changes to an existing package.json. You are free to update its dependencies as you see best.

## Features

The following features can be templated in:

- `csrf`: Enable csrf protection middleware
- `githubci`: Enable GitHub actions CI; defaults to on
- `honeycomb`: Enable honeycomb
- `jwt`: Enable jwt middleware; defaults to on
- `ping`: Enable /monitor/ping liveness endpoint; defaults to on
- `postgres`: Enable postgres
- `redis`: Enable redis
- `status`: Enable /monitor/status healthcheck endpoint; defaults to on
- `templates`: Enable Nunjucks templates

The GitHub CI workflow, ping, and status features are enabled by default. All other features are disabled by default.

You can rerun the boltzmann CLI in an existing project to update your copy of boltzmann or change which features you have enabled. The cli will respect the options you set earlier, and layer changes on top of this. To enable a feature, pass `--feature=on`.  For example, suppose you decide you need a redis client provided in middleware:

```shell
hello|⇒ npx boltzmann-cli --redis=on .
npx: installed 1 in 1.025s
Scaffolding a Boltzmann service in /Users/ceejbot/code/hello/.
    loaded settings from existing package.json
    writing boltzmann files...
    updating dependencies...
        adding handy-redis @ ^1.8.1 (redis activated)
        adding redis @ ^3.0.2 (redis activated)
    writing updated package.json...
    running package install...
Boltzmann at 0.1.1 with redis, githubci, status, ping
```

Pass `--feature=off` to remove a feature you have previously enabled. For example, if you decide you don't need redis after all:

```shell
hello|⇒ npx boltzmann-cli --redis=off .
npx: installed 1 in 1.012s
Scaffolding a Boltzmann service in /Users/ceejbot/code/hello/.
    loaded settings from existing package.json
    writing boltzmann files...
    updating dependencies...
        removing handy-redis (redis deactivated)
        removing redis (redis deactivated)
    writing updated package.json...
    running package install...
Boltzmann at 0.1.1 with githubci, status, ping
```

## Full usage

The current output of `npx boltzmann-cli help`:

```shell
boltzmann 0.1.1
Generate or update scaffolding for a Boltzmann service.
To enable a feature, mention it or set the option to `on`.
To remove a feature from an existing project, set it to `off`.

USAGE:
    boltzmann [FLAGS] [OPTIONS] [destination]

FLAGS:
        --force       Update a git-repo destination even if there are changes
    -h, --help        Prints help information
        --selftest    Build for a self-test.
    -s, --silent      Suppress all output except errors.
    -V, --version     Prints version information
    -v, --verbose     Pass -vv or -vvv to increase verbosity

OPTIONS:
        --csrf <csrf>              Enable csrf protection middleware
        --githubci <githubci>      Enable GitHub actions CI
        --honeycomb <honeycomb>    Enable honeycomb
        --jwt <jwt>                Enable jwt middleware
        --ping <ping>              Enable /monitor/ping liveness endpoint
        --postgres <postgres>      Enable postgres
        --redis <redis>            Enable redis
        --status <status>          Enable /monitor/status healthcheck endpoint
        --templates <templates>    Enable Nunjucks templates

ARGS:
    <destination>    The path to the Boltzmann service [default: ]
```
