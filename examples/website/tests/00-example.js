const {
  decorators: { test },
} = require('../boltzmann')
const tap = require('tap')

const _ = test({})

tap.test(
  'it works!',
  _(async (assert) => {
    const response = await assert.request({
      method: 'GET',
      url: 'world',
    })

    assert.matches(response.payload, 'world')
    assert.matches(response.payload, 'Hello, ')
  })
)
