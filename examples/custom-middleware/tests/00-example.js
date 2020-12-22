'use strict'

const { test } = require('tap')
const { middleware } = require('../boltzmann')

const _ = middleware.test({
  middleware: [], // by default, no middleware is installed under test.
})

test(
  'a basic health check of the test machinery',
  _(async (t) => {
    t.ok('yay')
  })
)
