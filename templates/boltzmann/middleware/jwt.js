
let _jwt = null
function authenticateJWT ({
  scheme = 'Bearer',
  publicKey = process.env.AUTHENTICATION_KEY,
  algorithms=['RS256'],
  storeAs = 'user'
} = {}) {
  algorithms = [].concat(algorithms)
  try {
    const assert = require('assert')
    algorithms.forEach(xs => assert(typeof xs == 'string'))
  } catch (_c) {
    throw new TypeError('The `algorithms` config option for JWTs must be an array of strings')
  }
  if (!publicKey) {
    throw new Error(
      `To authenticate JWTs you must pass the path to a public key file in either
the environment variable "AUTHENTICATION_KEY" or the publicKey config field
https://www.boltzmann.dev/en/docs/{{ version }}/reference/middleware/#authenticatejwt
`.trim().split('\n').join(' '))
  }
  _jwt = _jwt || require('jsonwebtoken')
  const verifyJWT = _jwt.verify

  return async next => {
    const publicKeyContents = (
      String(publicKey)[0] === '/'
      ? await fs.readFile(publicKey).catch(err => {
        console.error(`
          boltzmann authenticateJWT middleware cannot read public key at "${publicKey}".
          Is the AUTHENTICATION_KEY environment variable set correctly?
          Is the file readable?
          https://www.boltzmann.dev/en/docs/{{ version }}/reference/middleware/#authenticatejwt
        `.trim().split('\n').join(' '))
        throw err
      })
      : publicKey
    )

    return async context => {
      if (!context.headers.authorization) {
        return next(context)
      }

      if (!context.headers.authorization.startsWith(`${scheme} `)) {
        return next(context)
      }

      const token = context.headers.authorization.slice(scheme.length + 1)
      let data = null
      try {
        data = await new Promise((resolve, reject) => {
          verifyJWT(token, publicKeyContents, {algorithms}, (err, data) => {
            err ? reject(err) : resolve(data)
          })
        })
      } catch (err) {
        const logger = bole('boltzmann:jwt')
        logger.error(err)
        throw Object.assign(new Error('Invalid bearer token'), {
          [Symbol.for('status')]: 403
        })
      }

      context[storeAs] = data
      return next(context)
    }
  }
}
