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
      url: '/hello/world',
    })

    assert.equal(response.payload, 'hello world')
  })
)
