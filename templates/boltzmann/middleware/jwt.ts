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

/* {% if selftest %} */
import tap from 'tap'
/* istanbul ignore next */
{
  const { test } = tap

  test('jwt ignores requests without authorization header', async (assert) => {
    let called = 0
    const handler = await authenticateJWT({ publicKey: 'unused' })(() => {
      ++called
      return 'ok'
    })

    const result = await handler(<any>{ headers: {} })

    assert.equal(called, 1)
    assert.equal(result, 'ok')
  })

  test('jwt ignores requests with authorization header that do not match configured scheme', async (assert) => {
    let called = 0
    const handler = await authenticateJWT({ publicKey: 'unused' })(() => {
      ++called
      return 'ok'
    })

    const result = await handler(<any>{
      headers: {
        authorization: 'Boggle asfzxcdofj', // the Boggle-based authentication scheme
      },
    })

    assert.equal(called, 1)
    assert.equal(result, 'ok')
  })

  test('jwt validates and attaches payload for valid jwt headers', async (assert) => {
    const crypto = require('crypto')
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    })

    const jsonwebtoken = require('jsonwebtoken')
    const blob = await new Promise((resolve, reject) => {
      jsonwebtoken.sign(
        {
          ifItFits: 'iSits',
        },
        privateKey,
        {
          algorithm: 'RS256',
          noTimestamp: true,
        },
        (err: Error, data: any) => (err ? reject(err) : resolve(data))
      )
    })

    let called = 0
    const handler = await authenticateJWT({ publicKey })((context) => {
      ++called
      return context.user
    })

    const result = await handler(<any>{
      headers: {
        authorization: `Bearer ${blob}`,
      },
    })

    assert.equal(called, 1)
    assert.same(result, { ifItFits: 'iSits' })
  })

  test('jwt throws a 403 for valid jwt token using incorrect algo', async (assert) => {
    const crypto = require('crypto')
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    })

    const jsonwebtoken = require('jsonwebtoken')
    await new Promise((resolve, reject) => {
      jsonwebtoken.sign(
        {
          ifItFits: 'iSits',
        },
        privateKey,
        {
          algorithm: 'HS256',
        },
        (err: Error, data: any) => (err ? reject(err) : resolve(data))
      )
    })

    let called = 0
    const handler = await authenticateJWT({ publicKey })((context) => {
      ++called
      return context.user
    })

    try {
      await handler(<any>{
        headers: {
          authorization: 'Bearer banana', // WHO WOULDN'T WANT A BANANA, I ASK YOU
        },
      })
      assert.fail('expected failure, unexpected success. not cause for celebration')
    } catch (err) {
      assert.equal(called, 0)
      assert.equal(err[Symbol.for('status')], 403)
    }
  })

  test('jwt throws a 403 for invalid jwt headers', async (assert) => {
    let called = 0
    const handler = await authenticateJWT({ publicKey: 'unused' })(() => {
      ++called
      return 'ok'
    })

    try {
      await handler(<any>{
        headers: {
          authorization: 'Bearer banana', // WHO WOULDN'T WANT A BANANA, I ASK YOU
        },
      })
      assert.fail('expected failure, unexpected success. not cause for celebration')
    } catch (err) {
      assert.equal(called, 0)
      assert.equal(err[Symbol.for('status')], 403)
    }
  })

  test('authenticateJWT() ensures `algorithms` is an array', async (assert) => {
    let caught = 0
    try {
      authenticateJWT({ publicKey: 'unused', algorithms: <any>{ object: 'Object' } })
    } catch (err) {
      caught++
    }
    assert.equal(caught, 1)
    try {
      authenticateJWT({ publicKey: 'unused', algorithms: <any>'foo' })
    } catch (err) {
      caught++
    }
    assert.equal(caught, 1)
  })
}
/* {% endif %} */
