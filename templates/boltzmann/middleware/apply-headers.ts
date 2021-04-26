void `{% if selftest %}`;
export {
  XFOMode,
  applyHeaders,
  applyXFO
}

import { Handler } from '../core/middleware'
import { Context } from '../data/context'
void `{% endif %}`;

/**{{- tsdoc(page="03-middleware.md", section="applyheaders") -}}*/
function applyHeaders (headers: Record<string, string | string[]> = {}) {
  return (next: Handler) => {
    return async function xfo (context: Context) {
      const result = await next(context)
      Object.assign(result[Symbol.for('headers')], headers)
      return result
    }
  }
}

type XFOMode = 'DENY' | 'SAMEORIGIN'
function applyXFO (mode: XFOMode) {
  if (!['DENY', 'SAMEORIGIN'].includes(mode)) {
    throw new Error('applyXFO(): Allowed x-frame-options directives are DENY and SAMEORIGIN.')
  }
  return applyHeaders({ 'x-frame-options': mode })
}

void `{% if selftest %}`;
import tap from 'tap'
import {runserver} from '../bin/runserver'
import {inject} from '@hapi/shot'
/* istanbul ignore next */
if (require.main === module) {
  const { test } = tap

  test('applyXFO() ensures its option is DENY or SAMEORIGIN', async (assert) => {
    let caught = 0
    try {
      applyXFO(<any>'BADSTRING')
    } catch (_) {
      caught++
    }
    assert.equal(caught, 1)
    try {
      applyXFO('DENY')
    } catch (_) {
      caught++
    }
    assert.equal(caught, 1)
    try {
      applyXFO('SAMEORIGIN')
    } catch (_) {
      caught++
    }
    assert.equal(caught, 1)
  })

  test('applyHeaders adds requested headers', async (assert) => {
    const handler = async () => {
      return 'woot'
    }

    handler.route = 'GET /'
    const server = await runserver({
      middleware: [[applyHeaders, { currency: 'zorkmid' }]],
      handlers: { handler },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })

    assert.equal(response.payload, 'woot')
    assert.equal(response.headers.currency, 'zorkmid')
  })

  test('applyXFO adds xfo header', async (assert) => {
    const handler = async () => {
      return 'woot'
    }

    handler.route = 'GET /'
    const server = await runserver({
      middleware: [[applyXFO, 'DENY']],
      handlers: {
        handler,
      },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })

    assert.equal(response.headers['x-frame-options'], 'DENY')
  })
}
void `{% endif %}`;
