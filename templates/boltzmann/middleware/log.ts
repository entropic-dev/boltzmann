void `{% if selftest %}`;
export { log }

import bole from '@entropic/bole'
import isDev from 'are-we-dev'

import { honeycomb, otel } from '../core/honeycomb'
import { serviceName } from '../core/prelude'
import { Handler } from '../core/middleware'
import { Context } from '../data/context'
import { STATUS, THREW } from '../core/prelude'
void `{% endif %}`;

function log ({
  logger = bole(serviceName),
  // {% if honeycomb %}
  honeycombLogger = bole(`${serviceName}:honeycomb`),
  // {% endif %}
  level = process.env.LOG_LEVEL || 'debug',
  stream = process.stdout,
} = {}) {
  if (isDev()) {
    const pretty = require('bistre')({ time: true })
    pretty.pipe(stream)
    stream = pretty
  }
  bole.output({ level, stream })

  void `{% if honeycomb %}`
  honeycomb.logger = honeycombLogger

  const hasWriteKey: boolean = Boolean(
    honeycomb.options.writeKey && honeycomb.options.writeKey.length
  )

  let honeycombConfig: Record<string, unknown> = {
    serviceName: honeycomb.options.serviceName,
    writeKey: `${hasWriteKey ? "DEFINED" : "NOT DEFINED"}`,
    dataset: honeycomb.options.dataset
  }

  Object.assign(honeycombConfig, honeycomb.features)

  honeycombLogger.debug('Honeycomb tracing config:', honeycombConfig)

  void `{% endif %}`

  return function logMiddleware (next: Handler) {
    return async function inner (context: Context) {
      const result = await next(context)

      const body = result || {}
      if (body && body[THREW] && body.stack) {
        logger.error(body)
      }

      logger.info({
        message: `${body[Symbol.for('status')]} ${context.request.method} ${
          context.request.url
        }`,
        id: context.id,
        ip: context.remote,
        host: context.host,
        method: context.request.method,
        url: context.request.url,
        elapsed: Date.now() - context.start,
        status: body[Symbol.for('status')],
        userAgent: context.request.headers['user-agent'],
        referer: context.request.headers.referer
      })

      return body
    }
  }
}

void `{% if selftest %}`;
import tap from 'tap'
import {enforceInvariants} from './enforce-invariants'
/* c8 ignore next */
if (require.main === module) {
  const { test } = tap

  test('log: logs expected keys for success responses', async (assert) => {
    const logged: [string, Record<string, any>][] = []
    const loggedByHoneycomb: [string, Record<string, any>][] = []

    const handler = (_: Context) => {
      return { [STATUS]: 202, result: 'ok' }
    }

    const middleware = log({
      logger: <typeof bole><unknown>{
        debug(what: object) {
          logged.push(['debug', what])
        },
        info(what: object) {
          logged.push(['info', what])
        },
        error(what: object) {
          logged.push(['error', what])
        },
      },
      honeycombLogger: <typeof bole><unknown>{
        debug(what: object) {
          loggedByHoneycomb.push(['debug', what])
        },
      },
    })((context: Context) => handler(context))
    await middleware(<Context><unknown>{
      request: {
        method: 'GET',
        url: '/bloo',
        headers: {},
      },
      start: 0,
    })

    assert.equal(logged.length, 1)
    assert.equal(logged[0][0], 'info')
    assert.equal(logged[0][1].message, '202 GET /bloo')
    assert.equal(logged[0][1].status, 202)
    assert.ok('userAgent' in logged[0][1])
    assert.ok('referer' in logged[0][1])
    assert.ok('elapsed' in logged[0][1])
    assert.ok('url' in logged[0][1])
    assert.ok('host' in logged[0][1])
    assert.ok('ip' in logged[0][1])

    assert.equal(loggedByHoneycomb.length, 1)
    assert.equal(loggedByHoneycomb[0][0], 'debug')
    assert.equal(loggedByHoneycomb[0][1], 'Honeycomb tracing config:')
  })

  test('log: logs expected keys for thrown error responses', async (assert) => {
    const logged: [string, Record<string, any>][] = []
    const loggedByHoneycomb: [string, Record<string, any>][] = []
    const handler = (_: Context) => {
      throw new Error('foo')
    }

    const middleware = log({
      logger: <typeof bole><unknown>{
        info(what: object) {
          logged.push(['info', what])
        },
        error(what: object) {
          logged.push(['error', what])
        },
      },
      honeycombLogger: <typeof bole><unknown>{
        debug(what: object) {
          loggedByHoneycomb.push(['debug', what])
        },
      },
    })(enforceInvariants()((context: Context) => handler(context)))
    await middleware(<Context><unknown>{
      request: {
        method: 'GET',
        url: '/bloo',
        headers: {},
      },
      start: 0,
    })

    assert.equal(logged.length, 2)
    assert.equal(logged[0][0], 'error')
    assert.equal(logged[0][1].message, 'foo')
    assert.equal(logged[1][0], 'info')
    assert.equal(logged[1][1].message, '500 GET /bloo')

    assert.equal(loggedByHoneycomb.length, 1)
    assert.equal(loggedByHoneycomb[0][0], 'debug')
    assert.equal(loggedByHoneycomb[0][1], 'Honeycomb tracing config:')
  })
}
void `{% endif %}`;
