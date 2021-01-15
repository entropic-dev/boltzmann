const tap = require('tap')
const { middleware } = require('../boltzmann')

const _ = middleware.test({
  middleware: [
    middleware.log,
    [ middleware.applyCSRF, { cookieSecret: "it's a secret to everyone".repeat(2) } ],
  ],
})

tap.test((assert) => {
  assert.notEqual('write some tests', 'later')
  assert.end()
})

tap.test(
  _(async (assert) => {
    await assert.request({ url: '/' })
    assert.end()
  })
)

tap.test(
  _(async (assert) => {
    await assert.request({ url: '/' })
    assert.end()
  })
)
