// {% if selftest %}
import { decode as decodeJWT } from 'jsonwebtoken'
import bole from '@entropic/bole'
import { OAuth2 } from 'oauth'
import isDev from 'are-we-dev'
import crypto from 'crypto'
import { URL } from 'url'
import uuid from 'uuid'

import { Handler } from '../core/middleware'
import { Context } from '../data/context'
// {% endif %}

/* {% if selftest %} */ export /* {% endif %} */function handleOAuthLogin ({
  prompt,
  max_age,
  audience,
  connection,
  login_hint,
  connection_scope,
  loginRoute = '/login',
  domain = process.env.OAUTH_DOMAIN,
  clientId = process.env.OAUTH_CLIENT_ID,
  authorizationUrl = process.env.OAUTH_AUTHORIZATION_URL,
  callbackUrl = process.env.OAUTH_CALLBACK_URL,
  defaultNextPath = '/'
}: {
  prompt?: string
  max_age?: number,
  audience?: string,
  connection?: string,
  login_hint?: string,
  connection_scope?: string,
  loginRoute?: string,
  domain?: string,
  clientId?: string,
  authorizationUrl?: string,
  callbackUrl?: string,
  defaultNextPath?: string
} = {}) {
  if (!domain) {
    throw new Error(
      `You must provide a domain field to the handleOAuthLogin() middleware config
or set the env var OAUTH_DOMAIN to use OAuth
https://www.boltzmann.dev/en/docs/{{ version }}/reference/middleware/#oauth
`.trim().split('\n').join(' '))
  }

  if (!clientId) {
    throw new Error(
      `You must provide a clientID field to the handleOAuthLogin() middleware config
or set the env var OAUTH_CLIENT_ID to use OAuth
https://www.boltzmann.dev/en/docs/{{ version }}/reference/middleware/#oauth
`.trim().split('\n').join(' '))
  }

  const resolvedAuthorizationUrl = authorizationUrl || `https://${domain}/authorize`

  const extraOpts: Record<string, number | string> = {}

  if (connection) {
    extraOpts.connection = connection
  }

  if (connection_scope) {
    extraOpts.connection_scope = connection_scope
  }

  if (audience) {
    extraOpts.audience = audience
  }

  if (prompt) {
    extraOpts.prompt = prompt
  }

  if (login_hint) {
    extraOpts.login_hint = login_hint
  }

  if (max_age) {
    extraOpts.max_age = max_age
  }

  return (next: Handler) => async (context: Context) => {
    callbackUrl = callbackUrl || `http://${String(context.headers.host).split("/")[0] || 'localhost'}/callback`

    if (context.url.pathname !== loginRoute || context.method !== 'GET') {
      return next(context)
    }

    const nextUrl =  (
      context.query.next && /^\/(?!\/+)/.test(context.query.next) // must start with "/" and NOT contain "//"
      ? context.query.next
      : defaultNextPath
    )

    const nonce = crypto.randomBytes(16).toString('hex')
    const session = await context.session
    session.set('nonce', nonce)
    session.set('next', nextUrl)

    const authorizationParams = {
      ...extraOpts,

      // controlled by mechanism
      nonce,
      response_type: 'code', // this is the type of oauth flow – "code" means web browser flow
      redirect_uri: callbackUrl,
      client_id: clientId
    }

    const location = new URL(resolvedAuthorizationUrl)
    for (const [key, value] of Object.entries(authorizationParams)) {
      location.searchParams.set(key, value)
    }

    return Object.assign(Buffer.from(''), {
      [Symbol.for('status')]: 302,
      [Symbol.for('headers')]: {
        'Location': String(location)
      }
    })
  }
}

/* {% if selftest %} */ export /* {% endif %} */function handleOAuthCallback ({
  userKey = 'user',
  domain = process.env.OAUTH_DOMAIN,
  secret = process.env.OAUTH_CLIENT_SECRET,
  clientId = process.env.OAUTH_CLIENT_ID,
  callbackUrl = process.env.OAUTH_CALLBACK_URL,
  tokenUrl = process.env.OAUTH_TOKEN_URL,
  userinfoUrl = process.env.OAUTH_USERINFO_URL,
  authorizationUrl = process.env.OAUTH_AUTHORIZATION_URL,
  expiryLeewaySeconds = process.env.OAUTH_EXPIRY_LEEWAY,
  defaultNextPath = '/'
} = {}) {
  if (!domain) {
    throw new Error(
      `You must provide a domain field to the handleOAuthCallback() config
or set the env var OAUTH_DOMAIN to use OAuth
https://www.boltzmann.dev/en/docs/{{ version }}/reference/middleware/#oauth
`.trim().split('\n').join(' '))
  }

  if (!clientId) {
    throw new Error(
      `You must provide a clientID field to the handleOAuthCallback() config
or set the env var OAUTH_CLIENT_ID to use OAuth
https://www.boltzmann.dev/en/docs/{{ version }}/reference/middleware/#oauth
`.trim().split('\n').join(' '))
  }

  if (!secret) {
    throw new Error(
      `You must provide a secret field to the handleOAuthCallback() config
or set the env var OAUTH_CLIENT_SECRET to use OAuth
https://www.boltzmann.dev/en/docs/{{ version }}/reference/middleware/#oauth
`.trim().split('\n').join(' '))
  }

  authorizationUrl = authorizationUrl || `https://${domain}/authorize`
  const resolvedUserinfoUrl = userinfoUrl || `https://${domain}/userinfo`
  tokenUrl = tokenUrl || `https://${domain}/oauth/token`
  const oauth = new OAuth2(
    clientId,
    secret,
    '',
    authorizationUrl,
    tokenUrl,
    {}
  )

  let loginRoute: string | undefined
  const logger = bole('boltzmann:oauth')
  return (next: Handler) => async (context: Context) => {
    callbackUrl = callbackUrl || `http://${String(context.headers.host).split("/")[0] || 'localhost'}/callback`
    loginRoute = loginRoute || new URL(callbackUrl).pathname
    if (context.url.pathname !== loginRoute || context.method !== 'GET') {
      return next(context)
    }

    if (!context.query.code) {
      throw new Error('Code is required.')
    }

    const session = await context.session
    const expectedNonce = session.get('nonce')

    // XXX: this throws non-error-like objects with statusCodes; we may wish to forward 403 results out
    const { accessToken, refreshToken, params } = await new Promise((resolve, reject) => {
      const params = {
        'grant_type': 'authorization_code',
        'redirect_uri': callbackUrl
      }
      oauth.getOAuthAccessToken(context.query.code, params, (err, accessToken, refreshToken, params) => {
        err ? reject(err) : resolve({ accessToken, refreshToken, params })
      })
    })

    // NB: we are not checking the signature here; we're relying on the nonce
    // to protect us.
    try {
      var decoded = decodeJWT(params.id_token)
      if (typeof decoded === 'string' || decoded === null) {
        throw new Error("Failed to decode")
      }
    } catch(err) {
      const correlation = uuid.v4()
      logger.error(`err=${correlation}: failed to decode JWT (jwt="${params.id_token}")`)
      throw Object.assign(new Error(`Encountered error id=${correlation}`), {
        [Symbol.for('status')]: 400
      })
    }

    if (decoded.iss !== `https://${domain}/`) {
      const correlation = uuid.v4()
      logger.error(`err=${correlation}: Issuer mismatched. Got "${decoded.iss}", expected "https://${process.env.OAUTH_DOMAIN}/"`)
      throw Object.assign(new Error(`Encountered error id=${correlation}`), {
        [Symbol.for('status')]: 403
      })
    }

    if (!([] as string[]).concat(decoded.aud).includes(clientId)) {
      const correlation = uuid.v4()
      logger.error(`err=${correlation}: Audience mismatched. Got "${decoded.aud}", expected value of "clientId" (default: process.env.OAUTH_CLIENT_ID)`)
      throw Object.assign(new Error(`Encountered error id=${correlation}`), {
        [Symbol.for('status')]: 403
      })
    }

    if (decoded.nonce !== expectedNonce) {
      const correlation = uuid.v4()
      logger.error(`err=${correlation}: Nonce mismatched. Got "${decoded.nonce}", expected "${expectedNonce}"`)
      throw Object.assign(new Error(`Encountered error id=${correlation}`), {
        [Symbol.for('status')]: 403
      })
    }

    const now = Math.floor(Date.now() / 1000)
    const window = (Number(expiryLeewaySeconds) || 60)
    const expires = (Number(decoded.exp) || 0) + window

    if (expires < now) {
      const correlation = uuid.v4()
      logger.error(`err=${correlation}: Expiration time exceeded. Got "${decoded.exp}", expected "${now}" (leeway=${window})`)
      throw Object.assign(new Error(`Encountered error id=${correlation}`), {
        [Symbol.for('status')]: 403
      })
    }

    const profile = await new Promise((resolve, reject) => {
      oauth.get(resolvedUserinfoUrl, accessToken, (err, body) => {
        err ? reject(err) : resolve(JSON.parse(<string>body))
      })
    })

    const nextUrl = session.get('next') || defaultNextPath
    session.delete('nonce')
    session.delete('next')
    context.accessToken = accessToken
    context.refreshToken = refreshToken
    context.profile = profile
    context.nextUrl = nextUrl
    context.userKey = userKey
    return next(context)
  }
}

/* {% if selftest %} */ export /* {% endif %} */function handleOAuthLogout ({
  logoutRoute = '/logout',
  clientId = process.env.OAUTH_CLIENT_ID,
  domain = process.env.OAUTH_DOMAIN,
  returnTo = process.env.OAUTH_LOGOUT_CALLBACK,
  logoutUrl = process.env.OAUTH_LOGOUT_URL,
  userKey = 'user',
} = {}) {
  if (!domain) {
    throw new Error(
      `You must provide a domain to the handleOAuthLogout() middleware
or set the env var OAUTH_DOMAIN to use OAuth
https://www.boltzmann.dev/en/docs/{{ version }}/reference/middleware/#oauth
`.trim().split('\n').join(' '))
  }

  if (!clientId) {
    throw new Error(
      `You must provide a clientID to the handleOAuthLogout() middleware
or set the env var OAUTH_CLIENT_ID to use OAuth
https://www.boltzmann.dev/en/docs/{{ version }}/reference/middleware/#oauth
`.trim().split('\n').join(' '))
  }

  const resolvedLogoutUrl = logoutUrl || `https://${domain}/v2/logout`
  return (next: Handler) => async (context: Context) => {
    if (context.url.pathname !== logoutRoute || context.method !== 'POST') {
      return next(context)
    }

    const session = await context.session
    session.delete(userKey)
    session.reissue()

    returnTo = (
      returnTo ||
      `http://${context.host}${![80, 443].includes(context.request.connection.localPort) ? ':' + context.request.connection.localPort : ''}/`
    )

    const logout = new URL(resolvedLogoutUrl)
    logout.searchParams.set('returnTo', returnTo)
    logout.searchParams.set('client_id', clientId)

    return Object.assign(Buffer.from(''), {
      [Symbol.for('status')]: 302,
      [Symbol.for('headers')]: {
        'Location': String(logout)
      }
    })
  }
}

/* {% if selftest %} */ export /* {% endif %} */function oauth (options = {}) {
  const callback = handleOAuthCallback(options)
  const logout = handleOAuthLogout(options)
  const login = handleOAuthLogin(options)

  return (next: Handler) => callback(logout(login(next)))
}
