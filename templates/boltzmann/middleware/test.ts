// {% if selftest %}
import { inject, RequestOptions as ShotRequestOptions, Listener, SimulatedResponseObject } from '@hapi/shot'
import redis, {IHandyRedis} from 'handy-redis'
import { Client as PGClient } from 'pg'
import bole from '@entropic-dev/bole'
import isDev from 'are-we-dev'
import tap from 'tap'

import { json } from '../body/json'
import { urlEncoded } from '../body/urlencoded'
import { Handler, MiddlewareConfig } from '../core/middleware'
import { serviceName } from '../core/prelude'
import { Context } from '../data/context'
import { _requireOr } from '../utils'
import { BodyParserDefinition } from '../core/body'
import {main} from '../bin/main'

const THREW = Symbol.for('THREW')
// {% endif %}

type Test = NonNullable<ConstructorParameters<typeof tap.Test>[0]>;
type AugmentedTest = Test & {
  // {% if postgres %}
  postgresClient: PGClient,
  // {% endif %}
  // {% if redis %}
  redisClient: IHandyRedis,
  // {% endif %}
  request(opts: ShotRequestOptions): Promise<SimulatedResponseObject & { json?: ReturnType<JSON["parse"]>}>
}

let savepointId = 0

/* {% if selftest %} */ export /* {% endif %} */ function test({
  middleware = Promise.resolve([] as MiddlewareConfig[]),
  handlers = _requireOr('./handlers', {}),
  bodyParsers = _requireOr('./body', [urlEncoded, json]),
  after = require('tap').teardown,
}: {
  middleware?: Promise<MiddlewareConfig[]>
  handlers?: Promise<Record<string, Handler>>
  bodyParsers?: Promise<BodyParserDefinition[]>
  after: (...args: any[]) => void
}) {
  // {% if postgres %}
  const database = process.env.TEST_DB_NAME || `${serviceName}_test`
  const postgresClient = new PGClient({
    connectionString: process.env.PGURL || `postgres://localhost:5432/${database}`,
  })
  postgresClient.connect()
  // {% endif %}

  // {% if redis %}
  const redisClient = redis.createHandyClient(`redis://localhost:6379/7`)
  middleware = Promise.resolve(middleware).then((mw) => {
    mw.push(() => (next: Handler) => async (context: Context) => {
      context._redisClient = redisClient
      return next(context)
    })

    return mw
  })
  // {% endif %}

  // {% if postgres or redis %}
  after(() => {
    // {% if postgres %}
    postgresClient.end()
    // {% endif %}
    // {% if redis %}
    redisClient.quit()
    // {% endif %}
  })
  // {% endif %}

  return (inner: (t: AugmentedTest) => Promise<unknown> | unknown) => {
    return async (assert: Test) => {
      const [resolvedHandlers, resolvedBodyParsers, resolvedMiddleware] = await Promise.all([
        handlers,
        bodyParsers,
        middleware,
      ])
      // {% if redis %}
      assert.redisClient = redisClient
      // {% endif %}

      // {% if postgres %}
      // if we're in postgres, run the test in a transaction, run
      // routes in checkpoints.
      await postgresClient.query(`begin`)

      resolvedMiddleware.unshift(() => (next) => async (context) => {
        context._postgresConnection = Promise.resolve(postgresClient)
        const savepointname = `test_${process.pid}_${Date.now()}_${savepointId++}`
        const isTransactional = context.method !== 'GET' && context.method !== 'HEAD'
        if (isTransactional) {
          await postgresClient.query(`savepoint ${savepointname}`)
        }

        const result = await next(context)
        if (isTransactional) {
          if ((result || {})[THREW]) {
            await postgresClient.query(`rollback to savepoint ${savepointname}`)
          } else {
            await postgresClient.query(`release savepoint  ${savepointname}`)
          }
        }

        return result
      })
      assert.postgresClient = postgresClient
      // {% endif %}
      // {% if redis %}
      await redisClient.flushdb()
      resolvedMiddleware.unshift(() => (next: Handler) => async (context: Context) => {
        context._redisClient = redisClient
        return next(context)
      })
      assert.redisClient = redisClient
      // {% endif %}

      const server = await main({
        middleware: resolvedMiddleware,
        bodyParsers: resolvedBodyParsers,
        handlers: resolvedHandlers,
      })
      const [onrequest] = server.listeners('request')
      const request = async ({ method = 'GET', url = '/', headers = {}, body, payload, ...opts }: Partial<ShotRequestOptions> & { body?: string | Buffer } = {}) => {
        headers = headers || {}
        payload = payload || body
        if (!Buffer.isBuffer(payload) && typeof payload !== 'string' && payload) {
          payload = JSON.stringify(payload)
          headers['content-type'] = 'application/json'
        }

        const response = await inject(<Listener>onrequest, {
          method,
          url,
          headers,
          payload,
          ...opts,
        })

        Object.defineProperty(response, 'json', {
          get() {
            return JSON.parse(this.payload)
          },
        })

        return response
      }
      assert.request = request

      try {
        await inner(<AugmentedTest>assert)
      } finally {
        // {% if postgres %}
        await postgresClient.query('rollback')
        // {% endif %}
      }
    }
  }
}
