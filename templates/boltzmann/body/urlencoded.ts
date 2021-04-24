// {% if selftest %}
import querystring from 'querystring'

import { BodyParser, BodyInput } from '../core/body'
import { _collect } from '../core/utils'
export { urlEncoded }
// {% endif %}

/**{{- tsdoc(page="04-body-parsers.md", section="urlencoded") -}}*/
function urlEncoded (next: BodyParser) {
  return async (request: BodyInput) => {
    if (
      request.contentType.type !== 'application' ||
      request.contentType.subtype !== 'x-www-form-urlencoded' ||
      request.contentType.charset !== 'utf-8'
    ) {
      return next(request)
    }

    const buf = await _collect(request)
    // XXX: AFAICT there's no way to get the querystring parser to throw, hence
    // the lack of a try/catch here.
    return querystring.parse(String(buf))
  }
}

/* {% if selftest %} */
import tap from 'tap'
import {Context} from '../data/context'
import {runserver} from '../bin/runserver'
import {inject} from '@hapi/shot'
/* istanbul ignore next */
if (require.main === module) {
  const { test } = tap

  test('urlEncoded body: returns 415 if request is not application/x-www-form-urlencoded', async (assert) => {
    const handler = async (context: Context) => {
      await context.body
    }
    handler.route = 'GET /'
    const server = await runserver({
      middleware: [],
      bodyParsers: [urlEncoded],
      handlers: {
        handler,
      },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })

    assert.equal(response.statusCode, 415)
    assert.equal(JSON.parse(response.payload).message, 'Cannot parse request body')
  })

  test('urlEncoded body: returns urlEncoded if request is application/x-www-form-urlencoded', async (assert) => {
    const handler = async (context: Context) => {
      return await context.body
    }
    handler.route = 'GET /'
    const server = await runserver({
      middleware: [],
      bodyParsers: [urlEncoded],
      handlers: {
        handler,
      },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: querystring.stringify({ hello: 'world' }),
    })

    assert.equal(response.statusCode, 200)
    assert.same(JSON.parse(response.payload), { hello: 'world' })
  })

}
/* {% endif %} */
