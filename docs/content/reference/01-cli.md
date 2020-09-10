+++
title="Command Line Options"
weight = 1
[taxonomies]
tags = ["concepts"]
+++

The Boltzmann command-line interface (CLI) creates and updates a node project
for you, with a boltzmann.js file created from a template to your
specification, a package.json naming the required dependencies and some useful
run scripts, and a linter configuration.

<!-- more -->

Running `npx boltzmann-cli --help` gives an overview of the command-line
options. This document goes into more detail about them.

## Example usages

`npx boltzmann-cli web-server --redis --website`

Scaffolds a project in the directory `./web-server`, with the redis, csrf, and
templating features enabled.

`npx boltzmann-cli api-server --githubci=off --honeycomb --jwt --postgres`

Scaffolds a project in `./api-server` with Honeycomb tracing integration, jwt
parsing, and postgres client middleware. Turns off the default GitHubCI
workflow feature.

## Feature-flipping

Passing `--feature=[on,off]` turns the named feature on or off. You can also
enable a feature by mentioning it: `--feature` is equivalent to `--feature=on`.

You can rerun the boltzmann CLI in an existing project to update your copy of
boltzmann or change which features you have enabled. The cli will respect the
options you set earlier, and layer changes on top of this. To enable a feature,
pass `--feature=on`.  For example, suppose you decide you need a redis
client provided in middleware:

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

Boltzmann will manage its dependencies when a feature is flipped on or off, but
will not make other changes to an existing package.json. You are free to update
its dependencies as you see best.

The GitHub CI workflow, ping, and status features are enabled by default. All
other features are disabled by default.

## Command-line flags

### **Boolean options**

#### `--all`

_Added in version `0.1.3`._

Enables all features, except for `esm`.

**Example use:**

```shell
$ npx boltzmann-cli --all path/to/my/project
```

#### `--website`

_Added in version `0.1.3`._

Enable website feature set (templates, csrf.)

**Example use:**

```shell
$ npx boltzmann-cli --website path/to/my/project
```

#### `--selftest`

_Added in version `0.0.0`._

Scaffold Boltzmann in "self test" mode, to test the framework itself while developing it.

**Example use:**

```shell
$ npx boltzmann-cli --selftest path/to/my/project
$ tap path/to/my/project/test.js
```

#### `--docs`

_Added in version 0.1.3._

Open the documentation for the current version of Boltzmann in a web browser. Requires an
internet connection.

**Example use:**

```shell
$ npx boltzmann-cli --docs
```

#### `--force`

_Added in version `0.0.0`._

Update a git-repo destination even if there are changes.

**Example use:**

```shell
$ git init
$ touch foo.js
$ git commit -am 'add foo.js'
$ echo "example" > foo.js
$ npx boltzmann-cli --force . # if run without --force, boltzmann would 
                              # refuse to update the directory since it
                              # contains uncommitted changes.
```

#### `--silent`

_Added in version `0.0.0`._

Suppress all output except errors.

**Example use:**

```shell
$ npx boltzmann-cli --silent .
```

#### `--verbose`, `-v`, `-vv`

_Added in version `0.0.0`._

Log even more. Pass -v or -vv to increase verbosity.

**Example use:**

```shell
$ npx boltzmann-cli --verbose .
$ npx boltzmann-cli -vv .
```

#### `--version`

_Added in version `0.0.0`._

Print version information.

**Example use:**

```shell
$ npx boltzmann-cli --version
4.2.0
```

### **Feature-flipping options**

#### `--csrf`

_Added in version 0.1.1._

Enable [Cross Site Request Forgery (CSRF)] protection middleware. Requires manual
installation in [application-attached middleware] (`APP_MIDDLEWARE` in `middleware.js`.)

See [the reference documentation on `applyCSRF`] for middleware configuration.

Automatically enabled by the [`--website`] flag.

**Example use:**

```shell
$ npx boltzmann-cli . --csrf=on
```

**Basic middleware installation:**

```js
// middleware.js
const { middleware } = require('./boltzmann')

exports.APP_MIDDLEWARE = [
  middleware.applyCSRF
]
```

#### `--esm`

_Added in version 0.1.3._ Requires Node 14.

Scaffold in [ECMAScript Module (ESM)] mode, enabling use of [`import`/`export`
syntax]. Turning this flag on will set the `package.json` `"type"` field to
[`"module"` mode]. This flag is experimental, but we intend to eventually make
it the default.

**Example use:**

```shell
$ npx boltzmann-cli . --esm=on
```

#### `--githubci`

Enable [GitHub actions] for [Continuous Integration (CI)]; defaults to on. The
action will run when pushing to any branch. If the [`--postgres`] or [`--redis`]
flags are enabled for your application, the generated workflow file will include
those services.

**Example use:**

```shell
$ npx boltzmann-cli . # on by default
$ npx boltzmann-cli . --githubci=off # turn it off
```

#### `--honeycomb`

Enable [Honeycomb] tracing integration for observability (o11y). If enabled,
your application will use the following environment variables:

- `HONEYCOMBIO_WRITE_KEY`
- `HONEYCOMBIO_DATASET`
- `HONEYCOMBIO_TEAM` (Optional, used by development-mode [debug templates])

**Example use:**

```shell
$ npx boltzmann-cli . --honeycomb=on
```

#### `--jwt`

_Added in version 0.1.1._

Enable [JSON web token (JWT)] middleware; defaults to on.  Requires manual
installation in [application-attached middleware] (`APP_MIDDLEWARE` in
`middleware.js`.)

See [the reference documentation on `authenticateJWT`] for middleware
configuration. Notably: acceptable algorithms may be configured. If not
specified, a safe default algorithm will be chosen. JWTs encoded with an
unacceptable algorithm will be rejected. [<small>Why is this important?</small>][ref-none-alg]

**Example use:**

```shell
$ npx boltzmann-cli . --jwt=on
```

**Basic middleware installation:**

```js
// middleware.js
const { middleware } = require('./boltzmann')

exports.APP_MIDDLEWARE = [
  middleware.authenticateJWT
]
```

#### `--ping`

_Added in version 0.0.0._

Enable `/monitor/ping` liveness endpoint; defaults to on. This is implemented
as automatically-installed middleware that is executed before any application
middleware. The endpoint returns a `200 OK` and the plain-text name of a
spaceship from [Iain M Banks' Culture series][culture]; e.g. `"GSV Bora Horza
Gobuchul"`.

**Example use:**

```shell
$ npx boltzmann-cli .            # defaults to on
$ npx boltzmann-cli . --ping=off # turn it off
$ curl localhost:5000/monitor/ping
FP/(D)ROU Refreshingly Unconcerned With The Vulgar Exigencies Of Veracity
```

#### `--postgres`

_Added in version 0.0.0._

Enable postgres middleware, which will be automatically installed as
application-attached middleware. This flag adds an automatic reachability check
to the endpoint added by the [`--status`] flag, and augments the [`test`]
decorator. It also makes `context.postgresClient` available to application
request handlers and middleware. For more on how the postgres functionality
works, see ["persisting data"]. 

**Example use:**

```shell
$ npx boltzmann-cli . --postgres
```

#### `--redis`

_Added in version 0.0.0._

Enable redis middleware, which will be automatically installed as
application-attached middleware. This flag adds an automatic reachability check
to the endpoint added by the [`--status`] flag, and augments the [`test`]
decorator. It also makes `context.redisClient` available to application
request handlers and middleware. For more on how the redis functionality
works, see ["persisting data"]. 

**Example use:**

```shell
$ npx boltzmann-cli . --redis
```

#### `--status`

Enable a `/monitor/status` healthcheck endpoint; defaults to on. This functionality
is intended for deeper service health checks. Where [`ping`] answers "is this
process running?", `status` answers "what is the state of this process's backing
resources?"

The `status` functionality is implemented as an automatically-installed middleware.
It will load additional reachability checks from `reachability.js` (or `reachability/index.js`).
For more on monitoring, see ["monitoring your application"].

**Example use:**

```shell
$ npx boltzmann-cli .              # on by default
$ npx boltzmann-cli . --status=off # turn status off
```

#### `--templates`

_Added in version 0.1.2._

Makes [Nunjucks] template middleware available. This is enabled as part of the
[`--website`] flag. This middleware must be manually installed. For more on the
template functionality, see ["websites"]. To learn more about configuring the
middleware, see [the reference documentation on `template`].

**Example use:**

```shell
$ npx boltzmann-cli . --templates
$ npx boltzmann-cli . --website # implies --templates, --csrf
```

**Basic middleware installation:**

```js
// middleware.js
const { middleware } = require('./boltzmann')

exports.APP_MIDDLEWARE = [
  middleware.template
]
```

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

[`test`]: #TKTKTK
[the reference documentation on `applyCSRF`]: #TKTKTK
[the reference documentation on `authenticateJWT`]: #TKTKTK
[the reference documentation on `template`]: #TKTKTK
["monitoring your application"]: #TKTKTK
["persisting data"]: #TKTKTK
[debug templates]: @/concepts/03-websites.md#error-templates
[Honeycomb]: https://www.honeycomb.io
[GitHub actions]: https://docs.github.com/en/actions
[Continuous Integration (CI)]: https://en.wikipedia.org/wiki/Continuous_integration
[`ping`]: #ping
[`--website`]: #website
[`--status`]: #status
[`--postgres`]: #postgres
[`--redis`]: #redis
[Cross Site Request Forgery (CSRF)]: https://owasp.org/www-community/attacks/csrf
[application-attached middleware]: @/concepts/02-middleware.md#attaching-configuring-middleware
[JSON web token (JWT)]: https://jwt.io/introduction/
[ref-none-alg]: https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html#none-hashing-algorithm
[culture]: https://en.wikipedia.org/wiki/Culture_series
[Nunjucks]: https://mozilla.github.io/nunjucks/
["websites"]: @/concepts/03-websites.md
[`import`/`export` syntax]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import
[ECMAScript Module (ESM)]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules
[`"module"` mode]: https://nodejs.org/api/esm.html#esm_package_json_type_field

