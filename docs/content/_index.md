+++
weight = 1
title = "Boltzmann"
description = "Introduction to Boltzmann"
sort_by = "weight"
insert_anchor_links = "left"
+++

# Getting started

[Boltzmann](https://github.com/entropic-dev/boltzmann) is a node http server framework constructed
from the same building blocks as many other frameworks, using well-tested libraries like the ones
from the [jshttp project](https://jshttp.github.io), which support Express. It makes some choices
that are notably different from many other node frameworks, and you'll want to know about these
choices even if you're an experienced node developer.

The first difference you're likely to notice is that Boltzmann is not a versioned dependency of your
application. It's implemented in a single file that lives alongside your code. Its dependencies are
dependencies of your project. This decision makes some tradeoffs that we found useful in our
projects: we can choose when to upgrade core dependencies, and aren't tied to waiting for the
framework to update. We can also choose to modify Boltzmann's source code directly if the project
needs this, at the cost of no longer being able to update automatically.

As a result, you don't install Boltzmann using a package manager like yarn.
Instead, you scaffold a Boltzmann project using its templating tool. The
easiest way to run this tool is to use `npx`: `npx boltzmann-cli --help`. You
can also build the tool yourself from source if you have the Rust toolchain, or
[install a pre-built release](https://github.com/entropic-dev/boltzmann/releases).
This tool generates a single javascript file with all of Boltzmann's implementation, and some
scaffolding for a full Boltzmann app if it's not already present. Passing options to the tool
enables or disables specific Boltzmann features. The tool is safe to re-run, provided you are
running it in a versioned git directory.

The next major difference boltzmann has from frameworks like Express is its
[approach to middleware](@/concepts/02-middleware.md). It doesn't use the
Connect-style API and it doesn't offer lifecycle hooks. Instead, Boltzmann uses
an approach borrowed from aspect-oriented programming, which you'll be familiar
with if you've been using frameworks like React. Middleware is how you'll
implement new behavior that can be re-used in your route handlers. You can also
change Boltzmann's core behavior with custom middleware!

The third difference is in the API of Boltzmann's [route
handers](@/concepts/01-handlers.md#routing). To respond with data from a route, return the
data. Boltzmann sets content type headers based on what you return, deferring
to any headers you provide in the `headers` symbol on your response. To respond
with an error, throw: Boltzmann will translate to http semantics automatically.
(To control how thrown errors are translated, you can write middleware!) Learn
more about building responses in the [responses
documentation](@/concepts/01-handlers.md#responses).

Boltzmann also relies on a little bit of convention to simplify configuration.
For instance, it assumes that all route handlers are exported from
`handlers.js` or a `handlers/` directory in the same level of the project. The
same is true for middleware: you can move to exports from a `middleware/`
directory if you outgrow the initial `middleware.js` file.

## Hello world

Let's look at a hello-world project. You can create one by running the scaffolding tool
with its default options:

```shell
code|⇒ npx boltzmann-cli hello --redis
Scaffolding a Boltzmann service in /Users/cj/code/hello
    initializing a new NPM package...
    writing boltzmann files...
    25 dependencies added
    managing run scripts...
       npm run boltzmann:docs set  npm run boltzmann:routes set  npm run boltzmann:upgrade set
       npm run lint set            npm run posttest set          npm run start set
       npm run test set
    writing updated package.json...
    running package install...
Boltzmann @ 0.3.0-rc.1 with:
    githubci  ping  redis  status
```

You now have a complete hello world project in the `hello` directory, with commented source files to
edit in place. To run your scaffolded project, : `./boltzmann.js`. And to view the response: `curl
http://localhost:5000/hello/world`

In development, you can use `npm start` to run under nodemon.

The scaffolded project includes examples for most of the features you can choose to enable.
For instance, if you enable the `templates` feature, the scaffold gives you a hello world
template file to start with. Here's what you get with the default options:

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

A Boltzmann route handler is a function that returns an object or throws an error. Input to the
function is the *context* object. The [context object](@/concepts/01-handlers.md#context) is where
Boltzmann puts all data it derives from the initial request. It expects you to modify the context
object in middleware: it is there to hold data you find useful through the request lifecycle. The
raw node request object is available on the context object if you need it.

The default scaffolded project also provides a commented `middleware.js` file to help you write your
first middlewares. And finally, a linter is configured for you. Use `npm run` in a Boltzmann project
to see the run scripts provided out of the box for you.

## Learn more!

To learn more about Boltzmann's fundamentals, check out the [concepts documentation](@/concepts/_index.md). If you need to deep-dive into details, see the [reference documentation](@/reference/_index.md).
