import { test } from 'tap'
import { middleware } from '../boltzmann'

const _ = middleware.test({
  middleware: [middleware.log],
})

test(
  'a basic health check of the test machinery',
  _(async (t) => {
    t.ok('great success!')
  })
)

test(
  'verify that logging happens',
  _(async (t) => {
    await t.request({ url: '/fancy-name' })
    t.end()
  })
)
