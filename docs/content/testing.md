+++
title="Testing"
weight=13
+++

Boltzmann uses [tap](https://github.com/tapjs/node-tap) for testing. It provides some convenience wrappers to make testing your route handlers easier. It provides [shot](https://github.com/hapijs/shot) as a way to inject requests into your service. If you're using postgres, it wraps each test in a transaction so you can exercise your db code without changing state in your underlying database. We feel that databases are not behavior we want to replicate in mocks. It's more useful to test use of the db directly.

Here's an example test from a real-world Boltzmann service:

```js
import { decorators } from '../boltzmann.js'
import { test } from 'tap'

const _ = decorators.test({
    // testing middleware would go here
})

// note the use of the `_` wrapper here
test('sessionCreate: can create a session', _(async assert => {
  const result = await assert.request({
    url: '/sessions',
    method: 'POST',
    body: { hello: 'world' }
  })

  assert.equal(result.statusCode, 201)
  assert.ok(result.json.id.length)
  assert.same(result.json.session.data, { hello: 'world' })
  assert.ok(Date.parse(result.json.session.created))
  assert.ok(Date.parse(result.json.session.updated))
}))
```

TODO: example of setting up middleware for tests
