import { test } from 'tap'
import { middleware } from '../boltzmann.js'

const _ = middleware.test({
  middleware: [], // by default, no middleware is installed under test.
})

test(
  'a basic health check of the test machinery',
  _(async (t) => {
    t.ok('yay')
  })
)
