+++
title="Responses"
weight=4
+++

Of course, one of the most important functions of an HTTP framework
is providing affordances for responding to incoming requests.

<!-- more -->


Boltzmann aligns JavaScript function completion behaviors & types with HTTP
semantics: values you return will generate 200 status codes, while
thrown errors are represented as internal server errors with a 500 status
code, if unconfigured. Application authors may configure the HTTP behavior
of their responses by attaching metadata to them using global [symbols].

```typescript
handler.route = 'GET /'
function handler (context: Context) {
  return {
    [Symbol.for('status')]: 418,
    [Symbol.for('headers')]: {
      'x-clacks-overhead': 'GNU/Terry Pratchett'
    },
    message: 'I am a teapot!'
  }
}
```
