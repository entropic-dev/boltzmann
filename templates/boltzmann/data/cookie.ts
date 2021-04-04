import * as cookie from 'cookie'

const isDev = require('are-we-dev')

/* {% if selftest %} */export /* {% endif %} */class Cookie extends Map<string, cookie.CookieSerializeOptions & {value: string}> {
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
