+++
title = "Request Handlers and Routing"
slug = "handlers"
weight = 1
+++

## Introduction

Request handlers are a fundamental building block of Boltzmann applications.
They are functions which you provide to Boltzmann to **handle** HTTP requests.
Boltzmann examines your annotations to determine how to route requests and what
additional behaviors should be applied to your function.

<!-- more -->

This document will cover how handlers are routed, how handler responses are
interpreted, and the annotations available to you to control the behavior of
your handlers.

---

When your application receives an HTTP request, Boltzmann wraps it in a
[`Context`] object, calls your application-scoped middleware ([covered in the
next chapter]), then routes your request to one of your handlers. A
TypeScript definition of the types involved involved in this document is below.
Don't worry if you're not comfortable reading this syntax! We'll covered each
of the types below in natural language.

```typescript
class Context {
  // Contents covered in reference doc.
}

const HEADERS = Symbol.for('headers')
const STATUS = Symbol.for('status')

type UserResponse      = {[STATUS]?: number, [HEADERS]?: {[key: string]: string}} & 
                         (string | AsyncIterable<Buffer | string> | Buffer | Object);
type Handler           = {
  route?: String,
  method?: String,
  version?: String,
  middleware?: Array<Function | [Function, any...]>
} & (context: Context, ...args: any[]) => UserResponse | Promise<UserResponse>;
```

## Routing

You **annotate** routing information on your Boltzmann handlers by creating a
`.route` property on the exported function:

```javascript
// handlers.js

module.exports = {
  greeting
}

greeting.route = 'GET /hello'
function greeting (context) {
  return `hello world!`
}
```

Because the exported `greeting` function has a `.route` property, Boltzmann
installs the route into your application. Internally, Boltzmann uses the
powerful [`find-my-way`] router instance.

For example, the following handler will be executed whenever your application
receives a request like `GET /hello/world` or `GET /hello/mars`. The portion of
the path that matched `:subject` is available as `context.params.subject`.

```javascript
// handlers.js

module.exports = {
  greeting
}

greeting.route = 'GET /hello/:subject'
function greeting (context) {
  return `hello ${context.params.subject}!`
}
```

`find-my-way` supports multiple params in a path (`/:foo-:bar`), regexen
(`/:foo(\\d+)`), and wildcard params (`/*`, which creates `context.params['*']`).

If you wish to install a handler for multiple methods, you can split the route
definition like so:

```javascript
greeting.method = ['GET', 'POST']
greeting.route = '/hello/:subject'
function greeting (context) {
  return `hello ${context.params.subject}!`
}
```

`.route = 'GET /foo'` is shorthand for `.route = '/foo'; .method = ['GET'];`!

[`find-my-way`]: https://github.com/delvedor/find-my-way

## Context

When Boltzmann receives a request, it wraps the underlying Node [request]
and [response] objects in a [`Context`] object. This object provides cached
convenience methods, and is intended to be open to extension.

## Responses
## Annotations
## Next Steps
