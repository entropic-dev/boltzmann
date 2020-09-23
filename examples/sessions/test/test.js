const {
  decorators: { test },
} = require('../boltzmann')
const tap = require('tap')

const _ = test({})

tap.test(
  'it works!',
  _(async (assert) => {
    assert.notEqual('write some tests', 'later')
  })
)
