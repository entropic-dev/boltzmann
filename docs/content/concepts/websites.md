+++
title="Websites"
weight=4
[taxonomies]
tags = ["concepts"]
+++

Boltzmann can be configured with features that give you a jumpstart with
building websites. Specifically, you can build services that respond to route
handlers with templated text/html responses as well as JSON responses.

<!-- more -->

Enable the built-in cross-site request forgery protection by passing `--csrf`.
Enable the built-in template rendering by passing `--templates`. Cookie features
are built into Boltzmann.

To scaffold a service with all website-focused features, pass the `--website` option.


```shell
> boltzmann-cli --website --silent my-website
Boltzmann at 0.1.2 with csrf, githubci, jwt, ping, status, templates
```

Run the server with `node my-website/boltzmann.js`. Point your browser to
`http://localhost:5000/hello/world` to see the simple example template being rendered.

## Templates

Boltzmann's templates feature uses
[Nunjucks](https://mozilla.github.io/nunjucks/) templates. Template files by
default live in the `./templates` directory. Scaffolding with this feature
creates templates directory with an example `index.html` file for you, along
with a handler that renders it.

To respond from a route with a rendered template, name the template file in the
object return by the route handler, like this:

```
return {
  [Symbol.for('template')]: 'index.html',
  cats: ['Fezzik', 'Mina', 'Oswin' ],
  count: 10
}
```

Everything else in the object is passed to the template renderer as context.

Boltzmann looks for error templates in the `./templates` directory. It
follows the convention of looking for `4xx.html` for all 400-category errors,
and `5xx.html` for all 500-category errors.

In development mode, it has a static file server built-in, which can help you
test static assets like images. This feature is *disabled* in production, on
the assumption that you will be serving static assets differently. Static assets
are in the `static` directory by default.

Here's a project layout that requires no additional configuration:

```shell
.
├── boltzmann.js
├── handlers.js
├── middleware.js
├── package.json
├── static
│  └── favicon.ico
└── templates
   ├── 4xx.html
   ├── 5xx.html
   ├── base.html
   └── index.html
```

## Cookies

Cookie handling is always enabled in Boltzmann. The context object passed to each route handler
has functions for getting and setting cookies. The underlying implementation of cookie parsing is
from [jshttp/cookie](https://github.com/jshttp/cookie).

* `context.cookie.get(name)`: Get the named cookie; returns an object.
* `context.cookie.set(name, value)`: Set the named cookie. Sends the passed
  value to jshttp's cookie.serialize().
* `context.cookie.delete(name)`: Un-sets the named cookie.

## CSRF protection

Boltzmann uses the double-submit pattern to check that a form submission is
valid. It stores a secret in a signed cookie for the user. On requests with HTTP
verbs indicating mutation it verifies that a) the cookie signature is good, and
that b) the submitted token is valid for that secret.

You can configure the csrf middleware in the following ways:

- `cookieSecret`: the secret used to sign the cookie; defaults to
  `process.env.COOKIE_SECRET`
- `csrfCookie`: the name of the cookie to store the token in; defaults to
  `_csrf`
- `param`: a body param to look for the csrf token in; defaults to `_csrf`
- `header`: a response header to look for the csrf token in; is consulted first
  if both are used; defaults to `csrf-token`

## Error handling in development

If you are in development mode, with NODE_ENV set to something other than
production, Boltzmann catches errors in rendering templates and gives you a
debugging page with as much information as it can gather about the stack. This
includes links to source code and to Honeycomb traces if they're available.

{{image_sizer(path="concepts/error-template.jpeg", width=400)}}


