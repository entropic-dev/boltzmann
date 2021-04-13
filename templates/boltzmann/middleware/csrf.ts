// {% if selftest %}
import { Handler } from '../core/middleware'
import { Context } from '../data/context'
import CsrfTokens from 'csrf'
import crypto from 'crypto'
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

/* {% if selftest %} */export /* {% endif %} */function applyCSRF ({
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
