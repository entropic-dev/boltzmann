// {% if selftest %}
import { Algorithm, verify as verifyJWT } from 'jsonwebtoken'
import bole from '@entropic-dev/bole'
import { promises as fs } from 'fs'
import assert from 'assert'
import crypto from 'crypto'

import { Handler } from '../core/middleware'
import { Context } from '../data/context'
// {% endif %}

/* {% if selftest %} */export /* {% endif %} */function authenticateJWT ({
  scheme = 'Bearer',
  publicKey = process.env.AUTHENTICATION_KEY,
  algorithms=['RS256'],
  storeAs = 'user'
}: {
  scheme?: string,
  publicKey?: string,
  algorithms?: Algorithm | Algorithm[],
  storeAs?: string
} = {}) {
  const resolvedAlgorithms = ([] as Algorithm[]).concat(algorithms)
  try {
    resolvedAlgorithms.forEach(xs => assert(typeof xs == 'string'))
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

  return async (next: Handler) => {
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

    return async (context: Context) => {
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
          verifyJWT(token, publicKeyContents, {algorithms: resolvedAlgorithms}, (err, data) => {
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
