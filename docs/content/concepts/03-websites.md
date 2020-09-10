+++
title="Websites"
weight=3
slug="websites"
[taxonomies]
tags = ["concepts"]
+++

Boltzmann's defaults are good for building API servers, but it can be configured
with features that give you a jumpstart with building websites. Specifically,
you can build services that respond to route handlers with templated text/html
responses as well as JSON responses.

<!-- more -->

To scaffold a service with all website-focused features, pass the `--website` option.
This invocation gives you a simple website scaffold:

```shell
> boltzmann-cli --website --silent my-website
Boltzmann at 0.1.2 with csrf, githubci, jwt, ping, status, templates
```

Run the server with `node my-website/boltzmann.js`. Point your browser to
`http://localhost:5000/hello/world` to see the index template being rendered.

## Development mode vs production mode

Boltzmann changes its behavior if it is running in development mode. It makes
this decision using [are-we-dev](https://github.com/chrisdickinson/are-we-dev).
Not setting anything in `process.env.NODE_ENV` counts as being in development mode.
If you set `NODE_ENV` to anything that matches `staging`, `test`, or `prod`,
Boltzmann switches out of dev mode.

Logging output is pretty-printed in dev mode, and newline-delimited JSON otherwise.
CORS headers are more relaxed in dev mode, and Boltzmann will reveal more information
about errors. In particular, it'll render an informative error page when the templating
feature is available; read on for details.

## Cookies

Cookie handling is always enabled in Boltzmann. The context object passed to
each route handler has functions for getting and setting cookies. The underlying
implementation of cookie parsing is from
[jshttp/cookie](https://github.com/jshttp/cookie).

The functions for examining cookies are:

* `context.cookie.get(name)`: Get the named cookie; returns an object.
* `context.cookie.set(name, value)`: Set the named cookie. Sends the passed
  value to jshttp's cookie.serialize().
* `context.cookie.delete(name)`: Un-sets the named cookie.

## CSRF protection

You can toggle the cross-site request forgery protection (CSRF) feature on its own by
passing `--csrf=[on|off]`.

Boltzmann uses the double-submit pattern to check that a form submission is
valid. It stores a secret in a signed cookie for the user. On requests with HTTP
verbs indicating mutation it verifies that a) the cookie signature is good, and
that b) the submitted token is valid for that secret.

You can configure the csrf middleware by passing an object with these fields
to `boltzmann.middleware.applyCSRF`:

- `cookieSecret`: the secret used to sign the cookie; defaults to
  `process.env.COOKIE_SECRET`; required
- `csrfCookie`: the name of the cookie to store the token in; defaults to
  `_csrf`
- `param`: a body param to look for the csrf token in; defaults to `_csrf`
- `header`: a response header to look for the csrf token in; is consulted first
  if both are used; defaults to `csrf-token`

## Templates

You can toggle the template rendering feature on its own by passing
`--templates=[on|off]`.

Boltzmann's templates feature uses
[Nunjucks](https://mozilla.github.io/nunjucks/) templates. Template files by
default live in the `./templates` directory. Scaffolding with this feature
creates templates directory with an example `index.html` file for you, along
with a handler that renders it.

To respond from a route with a rendered template, name the template file in the
object return by the route handler using a symbol, like this:

```js
return {
  [Symbol.for('template')]: 'index.html',
  cats: ['Fezzik', 'Mina', 'Oswin' ],
  count: 10
}
```

Everything else in the object is passed to the template renderer as context.

### Error templates

If your route handler throws an error and the content-type requested was JSON,
Boltzmann responds with JSON errors. If you throw and the content-type requested
was HTML, Boltzmann looks for `4xx.html` or `5xx.html` template files.

In development mode, Boltzmann renders you a debugging page with as much
information as it can gather about the stack. This includes links to source code
and to Honeycomb traces if they're available. It will also catch errors in
rendering error templates.

{{image_sizer(path="concepts/error-template.jpeg", width=400)}}

Boltzmann only renders this debugging page if it was attempting to render a
template for the route experiencing the error.

## Static asset serving

Boltzmann also has a static file server built-in, which can help you test static
assets like images. This feature is *disabled* in production, on the assumption
that you will be serving static assets from a CDN. Static assets are in the
`static` directory by default.

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
