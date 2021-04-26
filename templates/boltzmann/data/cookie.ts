void `{% if selftest %}`;
import isDev from 'are-we-dev'
import * as cookie from 'cookie'
void `{% endif %}`;

/**{{- tsdoc(page="02-handlers.md", section="cookie") -}}*/
class Cookie extends Map<string, cookie.CookieSerializeOptions & {value: string}> {
  public changed: Set<string>

  constructor(values: Iterable<[string, any]>) {
    super(values)
    this.changed = new Set()
  }

  set (key: string, value: string | Partial<cookie.CookieSerializeOptions> & {value: string}) {
    if (this.changed) {
      this.changed.add(key)
    }

    const defaults = {
      sameSite: true,
      secure: !isDev(),
      httpOnly: true,
    }
    return super.set(key, typeof value === 'string' ? {
      ...defaults,
      value
    } : {
      ...defaults,
      ...value
    })
  }

  delete (key: string) {
    this.changed.add(key)
    return super.delete(key)
  }

  collect (): string[] {
    const cookies = []
    for (const key of this.changed) {
      if (this.has(key)) {
        const result = this.get(key)
        if (!result) {
          throw new TypeError('invalid data in cookie')
        }
        const { value, ...opts } = result
        cookies.push(cookie.serialize(key, value, opts))
      } else {
        cookies.push(cookie.serialize(key, 'null', {
          httpOnly: true,
          expires: new Date(),
          maxAge: 0
        }))
      }
    }

    return cookies
  }

  static from (string: string): Cookie {
    return new Cookie(Object.entries(cookie.parse(string)))
  }
}

void `{% if selftest %}`;
export { Cookie }
void `{% endif %}`;

void `{% if selftest %}`;
import tap from 'tap'
import {Context} from './context'
import {runserver} from '../bin/runserver'
import {inject} from '@hapi/shot'
/* c8 ignore next */
if (require.main === module) {
  const { test } = tap

  process.env.NODE_ENV = 'production'

  test('context.cookie contains the request cookies', async (assert) => {
    const handler = async (context: Context) => {
      assert.same(context.cookie.get('foo'), {
        value: 'bar',
        secure: true,
        sameSite: true,
        httpOnly: true,
      })

      assert.same(context.cookie.get('hello'), {
        value: 'world',
        secure: true,
        sameSite: true,
        httpOnly: true,
      })
    }

    handler.route = 'GET /'
    const server = await runserver({
      middleware: [],
      handlers: {
        handler,
      },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
      headers: {
        cookie: 'foo=bar; hello=world',
      },
    })

    assert.equal(response.statusCode, 204)
    assert.ok(!('set-cookie' in response.headers))
  })

  test('context.cookie.set creates cookies', async (assert) => {
    const handler = async (context: Context) => {
      context.cookie.delete('foo')
      context.cookie.set('zu', 'bat')
      context.cookie.set('hello', {
        value: 'world',
        httpOnly: false,
      })
    }

    handler.route = 'GET /'
    const server = await runserver({
      middleware: [],
      handlers: {
        handler,
      },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
      headers: {
        cookie: 'foo=bar; hello=world',
      },
    })

    const parsed = ([] as string[]).concat(response.headers['set-cookie']).sort()

    assert.equal(parsed.length, 3)
    assert.match(parsed[0], /foo=null; Max-Age=0; Expires=.* GMT; HttpOnly/)
    assert.match(parsed[1], /hello=world; Secure; SameSite=Strict/)
    assert.match(parsed[2], /zu=bat; HttpOnly; Secure; SameSite=Strict/)
  })
}
void `{% endif %}`;
