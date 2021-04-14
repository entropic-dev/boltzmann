// {% if selftest %}
import bole from '@entropic-dev/bole'
import isDev from 'are-we-dev'
import {ConfigureOptions, Extension} from 'nunjucks'
import path from 'path'
import {Handler} from '../core/middleware'
import {Context} from '../data/context'

const STATUS = Symbol.for('status')
const HEADERS = Symbol.for('headers')
const TEMPLATE = Symbol.for('template')
const THREW = Symbol.for('threw')
// {% endif %}

/* {% if selftest %} */export /* {% endif %} */interface BoltzmannNunjucksFilter {
  (...args: any[]): Promise<string> | string 
}

/* {% if selftest %} */export /* {% endif %} */function template ({
  paths = ['templates'],
  filters = {},
  tags = {},
  logger = bole('boltzmann:templates'),
  opts = {
    noCache: isDev()
  }
}: {
  paths?: string[],
  filters?: Record<string, BoltzmannNunjucksFilter>,
  tags?: Record<string, Extension>,
  logger?: typeof bole,
  opts?: Partial<ConfigureOptions>
} = {}) {
  const nunjucks = require('nunjucks')
  paths = ([] as string[]).concat(paths)
  try {
    const assert = require('assert')
    paths.forEach(xs => assert(typeof xs == 'string'))
  } catch (_c) {
    throw new TypeError('The `paths` option for template() must be an array of path strings')
  }

  paths = paths.slice().map(
    xs => path.join(__dirname, xs)
  )
  const env = new nunjucks.Environment(
    new nunjucks.FileSystemLoader(paths, {}),
    opts
  )

  for (const name in filters) {
    env.addFilter(name, (...args: any[]) => {
      const cb = args[args.length - 1]
      new Promise((resolve, _) => {
        resolve(filters[name](...args.slice(0, -1)))
      }).then(
        xs => cb(null, xs),
        xs => cb(xs, null)
      )
    }, true)
  }

  for (const name in tags) {
    env.addExtension(name, tags[name])
  }

  const devErrorTemplate = new nunjucks.Template(`
  {% include "boltzmann/middleware/error_template.html" %}
  `, env)

  // development behavior: if we encounter an error rendering a template, we
  // display a development error template explaining the error. If the error
  // was received while handling an original error, that will be displayed as
  // well. TODO: each stack frame should be displayed in context.
  //
  // production behavior: we try to render a 5xx.html template. If that's not
  // available, return a "raw" error display -- "An error occurred" with a
  // correlation ID.
  return (next: Handler) => {
    return async function template (context: Context) {
      const response = await next(context)
      let {
        [STATUS]: status,
        [HEADERS]: headers,
        [TEMPLATE]: template,
        [THREW]: threw
      } = response

      if (!template && !threw) {
        return response
      }

      let ctxt = response
      let name = template
      let renderingErrorTemplate = false
      if (threw && !template) {
        // If you threw and didn't have a template set, we have to guess at
        // whether this response is meant for consumption by a browser or
        // some other client.
        const maybeJSON = (
          context.headers['sec-fetch-dest'] === 'none' || // fetch()
          'x-requested-with' in context.headers ||
          (context.headers['content-type'] || '').includes('application/json')
        )

        if (maybeJSON) {
          return response
        }

        headers['content-type'] = 'text/html'
        const useDebug = isDev() && !('__production' in context.query)
        name = (
          useDebug
          ? devErrorTemplate
          : `${String(status - (status % 100)).replace(/0/g, 'x')}.html`
        )

        renderingErrorTemplate = true

        let frames: Record<string, unknown>[] | undefined
        if (useDebug) {
          const stackman = require('stackman')()
          frames = await new Promise((resolve, _) => {
            stackman.callsites(response, (err: Error, frames: Record<string, unknown>[]) => err ? resolve([]) : resolve(frames))
          })

          const contexts: Record<number, unknown> = await new Promise((resolve, _) => {
            stackman.sourceContexts(frames, (err: Error, contexts: Record<number, unknown>) => err ? resolve([]) : resolve(contexts))
          })

          ;(frames as Record<string, unknown>[]).forEach((frame, idx) => frame.context = contexts[idx])
        }

        ctxt = {
          context,
          response,
          frames,
          template,
          template_paths: paths,
          renderError: null,
          headers,
          threw,
          status
        }
      }

      let rendered: string | undefined
      try {
        rendered = await new Promise((resolve, reject) => {
          env.render(name, ctxt, (err: Error, result: string) => {
            err ? reject(err) : resolve(result)
          })
        })
      } catch (err) {
        status = err[STATUS] || 500
        const target = !renderingErrorTemplate && isDev() ? devErrorTemplate : '5xx.html'

        rendered = await new Promise((resolve, _) => {
          env.render(target, {
            context,
            response,
            template: name,
            template_paths: paths,
            renderError: err,
            headers,
            status
          }, (err: Error, result: string) => {
            if (err) {
              const correlation = require('uuid').v4()
              if (response.stack) {
                logger.error(`[${correlation} 1/2] Caught error rendering 5xx.html for original error: ${response.stack}`)
              }
              logger.error(`[${correlation} ${response.stack ? '2/2' : '1/1'}] Caught template error while rendering 5xx.html: ${err.stack}`)

              resolve(`
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <meta charset="UTF-8">
                <title></title>
              </head>
              <body>
                <h1>An unexpected server error occurred (ref: <code>${correlation}</code>).</h1>
              </body>
              </html>`)
            } else {
              resolve(result)
            }
          })
        })
      }

      // NB: This removes "THREW" because the template layer is handling the error.
      return Object.assign(Buffer.from(<string>rendered, 'utf8'), {
        [STATUS]: status,
        [HEADERS]: headers,
      })
    }
  }
}


/* {% if selftest %} */
import { promises as fs } from 'fs'
import tap from 'tap'
import {main} from '../bin/runserver'
import {inject} from '@hapi/shot'
{
  const { test } = tap

  test('template() ensures `paths` is an array', async (assert) => {
    let caught = 0
    try {
      template(<any>{ paths: { foo: 'bar' } })
    } catch (err) {
      assert.match(err.message, /must be an array/)
      caught++
    }
    assert.equal(caught, 1)
    try {
      template(<any>{ paths: 'foo' })
    } catch (err) {
      caught++
    }
    assert.equal(caught, 1)
    try {
      template({ paths: ['foo', 'bar'] })
    } catch (err) {
      caught++
    }
    assert.equal(caught, 1)
  })

  test('template middleware intercepts template symbol responses', async (assert) => {
    let called = 0
    const handler = async () => {
      ++called
      return {
        [TEMPLATE]: 'test.html',
        greeting: 'hello',
      }
    }

    await fs.writeFile(
      path.join(__dirname, 'templates', 'test.html'),
      `
      {% raw %}{{ greeting }} world{% endraw %}
    `.trim()
    )

    handler.route = 'GET /'
    const server = await main({
      middleware: [template],
      handlers: {
        handler,
      },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })

    assert.equal(called, 1)
    assert.equal(response.payload, 'hello world')
  })

  test('template middleware allows custom filters', async (assert) => {
    let called = 0
    const handler = async () => {
      ++called
      return {
        [TEMPLATE]: 'test.html',
        greeting: 'hello',
      }
    }

    await fs.writeFile(
      path.join(__dirname, 'templates', 'test.html'),
      `
      {% raw %}{{ greeting|frobnify }} world{% endraw %}
    `.trim()
    )

    handler.route = 'GET /'
    const server = await main({
      middleware: [
        [
          template,
          {
            filters: {
              // explicitly async to test our munging
              frobnify: async (xs: string) => xs + 'frob',
            },
          },
        ],
      ],
      handlers: {
        handler,
      },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })

    assert.equal(called, 1)
    assert.equal(response.payload, 'hellofrob world')
  })

  test('template middleware allows custom tags', async (assert) => {
    let called = 0
    const handler = async () => {
      ++called
      return {
        [TEMPLATE]: 'test.html',
        greeting: 'hello',
      }
    }

    class FrobTag {
      tags = ['frob']
      parse(parser: any, nodes: any) {
        const tok = parser.nextToken()
        const args = parser.parseSignature(null, true)
        parser.advanceAfterBlockEnd(tok.value)
        const body = parser.parseUntilBlocks('endfrob')
        parser.advanceAfterBlockEnd()
        return new nodes.CallExtension(this, 'run', args, [body])
      }

      run(_: any, body: any) {
        return body().split(/\s+/).join('frob ') + 'frob'
      }
    }

    await fs.writeFile(
      path.join(__dirname, 'templates', 'test.html'),
      `
      {% raw %}{% frob %}{{ greeting }} world{% endfrob %}{% endraw %}
    `.trim()
    )

    handler.route = 'GET /'
    const server = await main({
      middleware: [
        [
          template,
          {
            tags: {
              frob: new FrobTag(),
            },
          },
        ],
      ],
      handlers: {
        handler,
      },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })

    assert.equal(called, 1)
    assert.equal(response.payload, 'hellofrob worldfrob')
  })

  test('template middleware custom filters may throw', async (assert) => {
    let called = 0
    process.env.NODE_ENV = ''
    const handler = async () => {
      ++called
      return {
        [TEMPLATE]: 'test.html',
        greeting: 'hello',
      }
    }

    await fs.writeFile(
      path.join(__dirname, 'templates', 'test.html'),
      `
      {% raw %}{{ greeting|frobnify }} world{% endraw %}
    `.trim()
    )

    handler.route = 'GET /'
    const server = await main({
      middleware: [
        [
          template,
          {
            filters: {
              frobnify: (_: string) => {
                throw new Error('oops oh no')
              },
            },
          },
        ],
      ],
      handlers: {
        handler,
      },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })

    assert.equal(called, 1)
    assert.match(response.payload, /oops oh no/)
  })

  test('reset env', async (_) => {
    process.env.NODE_ENV = 'test'
  })

  test('template errors are hidden in non-dev mode', async (assert) => {
    let called = 0
    const handler = async () => {
      ++called
      return {
        [TEMPLATE]: 'test.html',
        greeting: 'hello',
      }
    }

    await fs.writeFile(
      path.join(__dirname, 'templates', 'test.html'),
      `
      {% raw %}{{ greeting|frobnify }} world{% endraw %}
    `.trim()
    )

    handler.route = 'GET /'
    const server = await main({
      middleware: [
        [
          template,
          {
            filters: {
              frobnify: () => {
                throw new Error('oops oh no')
              },
            },
          },
        ],
      ],
      handlers: {
        handler,
      },
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'GET',
      url: '/',
    })

    assert.equal(called, 1)
    assert.notMatch(response.payload, /oops oh no/)
  })

}
/* {% endif %} */
