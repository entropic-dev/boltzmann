// {% if selftest %}
import { Handler } from '../core/middleware'
import { Context } from '../data/context'
import CsrfTokens from 'csrf'
import crypto from 'crypto'

export { applyCSRF }
// {% endif %}

// csrf protection middleware
function signCookie(value: string, secret: string) {
  return `${value}.${crypto.createHmac('sha256', secret).update(value).digest('base64')}`
}

function checkCookieSignature(input: string, secret: string) {
  if (!input) {
    return false
  }
  const [ message, ] = input.split('.', 2)
  const valid = signCookie(message, secret)
  if (valid.length !== input.length) {
    return false
  }
  return crypto.timingSafeEqual(Buffer.from(input), Buffer.from(valid)) ? message : false
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**{{- tsdoc(page="03-middleware.md", section="applycsrf") -}}*/
function applyCSRF ({
  cookieSecret = process.env.COOKIE_SECRET,
  csrfCookie = '_csrf',
  param = '_csrf',
  header = 'csrf-token'
}: {
  cookieSecret?: string,
  csrfCookie?: string,
  param?: string,
  header?: string
} = {}) {

  if (!cookieSecret) {
    throw new Error('You cannot use CSRF middleware without providing a secret for signing cookies')
  }

  return (next: Handler) => {
    const tokens = new CsrfTokens()
    return async function csrf (context: Context) {

      // set up context for handler, with intentional hoist
      context.csrfToken = csrfToken
      var secret = fetchSecretFromCookie()
      var token: string | undefined = undefined

      if (!secret) {
        secret = generateNewSecretCookie()
      }

      if (READ_METHODS.has(String(context.method))) {
        return next(context)
      }

      const body = await context.body
      const tk = (body && body[param]) || context.headers[header]

      if (!tokens.verify(secret, tk)) {
        throw Object.assign(new Error('Invalid CSRF token'), {
          [Symbol.for('status')]: 403
        })
      }

      return next(context)

      function generateNewSecretCookie () {
        const newSecret = tokens.secretSync()
        const signed = signCookie(newSecret, String(cookieSecret))
        context.cookie.set(csrfCookie, signed)
        return newSecret
      }

      function fetchSecretFromCookie () {
        const candidate = context.cookie.get(csrfCookie)
        if (!candidate) {
          return undefined
        }
        return checkCookieSignature(candidate.value, String(cookieSecret))
      }

      // Handlers can call this to get a token to use on relevant requests.
      // It creates a token-generating secret for the user if they don't have one
      // already, and makes a new token.
      function csrfToken ({refresh = false} = {}) {
        const freshSecret = fetchSecretFromCookie()

        // We might be coming through here more than once.
        // Re-use the token if we can, but generate a new one if the secret in the cookie changed.
        if (!refresh && token && (freshSecret === secret) ) {
          return token
        }

        if (!freshSecret) {
          secret = generateNewSecretCookie() // changes value in the closure
        }

        token = tokens.create(String(secret)) // changes value in the closure
        return token
      }
    }
  }
}


/* {% if selftest %} */
import tap from 'tap'
import {runserver} from '../bin/runserver'
import {inject} from '@hapi/shot'
/* istanbul ignore next */
if (require.main === module) {
  const { test } = tap

  test('cookie signature check short-circuits on length check', async (assert) => {
    const check = checkCookieSignature('womp.signature', 'not-very-secret')
    assert.equal(check, false)
  })

  test('csrf middleware requires a signing secret', async (assert) => {
    let error
    let threw = false
    try {
      (await runserver({
        middleware: [[applyCSRF, {}]],
        handlers: {},
      })).close()
    } catch (ex) {
      threw = true
      error = ex
    }

    assert.ok(threw)
    assert.ok(/a secret for signing cookies/.test(error.message))
  })

  test('csrf middleware adds a token generator to the context', async (assert) => {
    const handler = async (context: Context) => {
      assert.equal(typeof context.csrfToken, 'function')
      const t1 = context.csrfToken()
      const t2 = context.csrfToken()
      assert.equal(t1, t2)
      return t1
    }

    handler.route = 'GET /'
    const server = await runserver({
      middleware: [[applyCSRF, { cookieSecret: 'not-very-secret' }]],
      handlers: { handler },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })
    assert.equal(response.statusCode, 200)
    assert.equal(typeof response.payload, 'string')
  })

  test('the token generator allows you to force a fresh token', async (assert) => {
    const handler = async (context: Context) => {
      const t1 = context.csrfToken()
      const t2 = context.csrfToken({ refresh: true })
      const t3 = context.csrfToken({ refresh: false })
      assert.not(t1, t2)
      assert.equal(t2, t3)
      return 'my tokens are fresh'
    }

    handler.route = 'GET /'
    const server = await runserver({
      middleware: [[applyCSRF, { cookieSecret: 'not-very-secret' }]],
      handlers: { handler },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })
    assert.equal(response.statusCode, 200)
    assert.equal(response.payload, 'my tokens are fresh')
  })

  test('csrf middleware enforces presence of token on mutations', async (assert) => {
    let called = 0
    const handler = async () => {
      called++
      return 'no tokens at all'
    }

    handler.route = 'PUT /'
    const server = await runserver({
      middleware: [[applyCSRF, { cookieSecret: 'not-very-secret' }]],
      handlers: { handler },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'PUT',
      url: '/',
      payload: { text: 'I am quite tokenless.' },
    })

    assert.equal(response.statusCode, 403)
    assert.ok(/Invalid CSRF token/.test(response.payload))
    assert.equal(called, 0)
  })

  test('csrf middleware accepts valid token in body', async (assert) => {
    const _c = require('cookie')

    let called = 0
    const handler = async () => {
      called++
      return 'my token is good'
    }

    const cookieSecret = 'avocados-are-delicious'
    const tokens = new CsrfTokens()
    const userSecret = await tokens.secret()
    const token = tokens.create(userSecret)
    const signedUserSecret = signCookie(userSecret, cookieSecret)

    handler.route = 'PUT /'
    const server = await runserver({
      middleware: [[applyCSRF, { cookieSecret }]],
      handlers: { handler },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'PUT',
      url: '/',
      headers: { cookie: _c.serialize('_csrf', signedUserSecret) },
      payload: { _csrf: token },
    })

    assert.equal(called, 1)
    assert.equal(response.statusCode, 200)
    assert.equal(response.payload, 'my token is good')
  })

  test('csrf middleware accepts valid token in headers', async (assert) => {
    const _c = require('cookie')

    let called = 0
    const handler = async () => {
      called++
      return 'my header token is good'
    }

    const cookieSecret = 'avocados-are-delicious'
    const tokens = new CsrfTokens()
    const userSecret = tokens.secretSync()
    const signedUserSecret = signCookie(userSecret, cookieSecret)
    const token = tokens.create(userSecret)

    handler.route = 'PUT /'
    const server = await runserver({
      middleware: [[applyCSRF, { cookieSecret, header: 'my-header' }]],
      handlers: { handler },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'PUT',
      url: '/',
      headers: {
        cookie: _c.serialize('_csrf', signedUserSecret),
        'my-header': token,
      },
      payload: {},
    })

    assert.equal(called, 1)
    assert.equal(response.statusCode, 200)
    assert.equal(response.payload, 'my header token is good')
  })

  test('csrf middleware rejects bad tokens', async (assert) => {
    const _c = require('cookie')

    let called = 0
    const handler = async () => {
      called++
      return 'my body token is bad'
    }

    const cookieSecret = 'avocados-are-delicious'
    const tokens = new CsrfTokens()
    const userSecret = tokens.secretSync()
    const signedUserSecret = signCookie(userSecret, cookieSecret)
    tokens.create(userSecret)

    handler.route = 'PUT /'
    const server = await runserver({
      middleware: [[applyCSRF, { cookieSecret }]],
      handlers: { handler },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'PUT',
      url: '/',
      headers: { cookie: _c.serialize('_csrf', signedUserSecret) },
      payload: { _csrf: 'bad-token-dudes' },
    })

    assert.equal(response.statusCode, 403)
    assert.ok(/Invalid CSRF token/.test(response.payload))
    assert.equal(called, 0)
  })

  test('csrf middleware ignores secrets with bad signatures', async (assert) => {
    const _c = require('cookie')

    let called = 0
    const handler = async () => {
      called++
      return 'my signature is bad'
    }

    const cookieSecret = 'avocados-are-delicious'
    const tokens = new CsrfTokens()
    const userSecret = tokens.secretSync()
    const signedUserSecret = signCookie(userSecret, 'cilantro-is-great')
    tokens.create(userSecret)

    handler.route = 'PUT /'
    const server = await runserver({
      middleware: [[applyCSRF, { cookieSecret }]],
      handlers: { handler },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'PUT',
      url: '/',
      headers: { cookie: _c.serialize('_csrf', signedUserSecret) },
      payload: { _csrf: 'bad-token-dudes' },
    })

    assert.equal(response.statusCode, 403)
    assert.ok(/Invalid CSRF token/.test(response.payload))
    assert.equal(called, 0)
  })
}
/* {% endif %} */
