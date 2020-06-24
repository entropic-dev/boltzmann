+++
title = "Request Handlers and Routing"
weight = 1
+++

## Introduction

Handlers are the fundamental building block of Boltzmann applications. They are
functions which you provide to Boltzmann to **handle** HTTP requests.
Information you annotate onto your handler functions tells Boltzmann which
requests should be routed to which handlers.

This document will cover how handlers are routed, how handler responses are
interpreted, and the annotations available to you to affect the behavior of
your handlers.

---

When your application receives an HTTP request, Boltzmann wraps it in a
`Context` object, calls your application-scoped middleware ([covered in the
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

TKTK

This handler will be executed whenever your application receives a request like
`GET /hello/world` or `GET /hello/mars`. The portion of the path that matched
`:subject` is available as `context.params.subject`.

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


Boltzmann's routing is provided by [`find-my-way`] under the hood.

[`find-my-way`]: https://github.com/delvedor/find-my-way

## Context and Responses
## Annotations
## Next Steps
