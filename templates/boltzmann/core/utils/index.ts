// {% if selftest %}
import { promises as fs, createReadStream } from 'fs'
import { IncomingMessage } from 'http'
import path from 'path'

import { MiddlewareConfig } from '../../core/middleware'
import { BodyParserDefinition } from '../../core/body'
// {% endif %}

/* {% if selftest %} */ export /* {% endif %} */ async function _collect(request: IncomingMessage) {
  const acc = []
  for await (const chunk of request) {
    acc.push(chunk)
  }
  return Buffer.concat(acc)
}

type MiddlewareImport = { APP_MIDDLEWARE: MiddlewareConfig[] } | MiddlewareConfig[]
/* {% if selftest %} */ export /* {% endif %} */ function _processMiddleware(
  middleware: MiddlewareImport
): MiddlewareConfig[] {
  if (Array.isArray(middleware)) {
    return middleware
  } else {
    return middleware.APP_MIDDLEWARE
  }
}

type BodyImport = { APP_BODY_PARSERS: BodyParserDefinition[] } | BodyParserDefinition[]
/* {% if selftest %} */ export /* {% endif %} */ function _processBodyParsers(parsers: BodyImport) {
  if (Array.isArray(parsers)) {
    return parsers
  } else {
    return parsers.APP_BODY_PARSERS
  }
}

/* {% if selftest %} */ export /* {% endif %} */ async function _requireOr(target: string, value: any) {
  try {
    return require(target)
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && err.requireStack && err.requireStack[0] === __filename) {
      return value
    }
    throw err
  }
}

/* {% if selftest %} */
import { Test } from '../../middleware/test'
import tap from 'tap'
/* istanbul ignore next */
if (require.main === module) {
  const { test } = tap

  test('_requireOr only returns default for top-level failure', async (assert: Test) => {
    await fs.writeFile(path.join(__dirname, 'require-or-test'), 'const x = require("does-not-exist")')

    try {
      await _requireOr('./require-or-test', [])
      assert.fail('expected to fail with MODULE_NOT_FOUND')
    } catch (err) {
      assert.equals(err.code, 'MODULE_NOT_FOUND')
    }
  })

  test('_requireOr returns default if toplevel require fails', async (assert: Test) => {
    const expect = {}
    assert.equals(await _requireOr('./d-n-e', expect), expect)
  })

  test('_collect takes a stream and returns a promise for a buffer of its content', async (assert: Test) => {
    const result = await _collect(<IncomingMessage>(<unknown>createReadStream(__filename)))
    const expect = await fs.readFile(__filename)

    assert.equals(String(result), String(expect))
  })
}
/* {% endif %} */
