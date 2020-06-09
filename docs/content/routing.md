+++
title="Route handlers"
weight=7
+++

Route handlers are functions with a `route` field. The route field is a [find-my-way](https://github.com/delvedor/find-my-way) route with a little sugar. The handler is a function that takes a context object and returns a plain old Javascript object *or* throws an error.

Boltzmann looks for handlers exported by the following two places:

- from `handlers.js` in the same directory (good for small services)
- from `handlers/index.js`

The scaffolding tool gives you a working `handlers.js` file.

The route field should look like this: `VERB /path/with/:params`. The first segment of the string must be an http verb that `find-my-way` can pass to its `route.on()`. The second segment must be a path format that `find-my-way` understands.

To respond to a request with data, return the data from your handler function. Boltmann will correctly set content type headers for several common response types, like `text/plain` and `application/json`.

Here is a Boltzmann hello world:

```js
greeting.route = 'GET /greeting'
function greeting(context) {
    return 'hello world'
}
```

To return an error, throw. Here's an example of an error response with a custom status code:

```js
throwup.route = 'GET /error'
function throwup(context) {
    throw Object.assign(new Error('this has not yet been implemented'), {[Symbol.for('status')]: 501)
}
```

To control response headers and status, add `Symbol.for('status')` and `Symbol.for('headers')` symbols as attributes to your response object. You can do this in normal responses as well as error responses. We use symbols so we don't collide with any fields you might want to put on your response object yourself.

A route can also have an optional `.version` field. A version string instructs `find-my-way` to use the accept-version header field to match incoming requests to the version of the route provided. By convention, you must use valid semver in version fields.

Routes have one more meaningful optional field: `decorators`.

