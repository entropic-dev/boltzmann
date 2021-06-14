void `{% if selftest %}`;
export { BoltzmannNunjucksFilter, template }

import bole from '@entropic/bole'
import isDev from 'are-we-dev'
import {ConfigureOptions, Extension} from 'nunjucks'
import path from 'path'

import {STATUS, HEADERS, TEMPLATE, THREW} from '../core/prelude'
import {Handler} from '../core/middleware'
import {Context} from '../data/context'
void `{% endif %}`;

interface BoltzmannNunjucksFilter {
  (...args: any[]): Promise<string> | string 
}

const boltzmannVersion = `{{ version }}`
// {% raw %}
const devErrorTemplateSource = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>
      {% if response.stack %}{{ response.name }}: {{ response.message }}{% elif
      renderError %}{{ renderError.name }}: {{ renderError.message }}{% else
      %}Error{% endif%}
    </title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/tachyons@4.12.0/css/tachyons.min.css"
    />
    <style>
      #stacktrace .copy-and-paste {
        display: none;
      }
      #stacktrace.paste .copy-and-paste {
        display: block;
      }
      #stacktrace.paste .rich {
        display: none;
      }
      .frame {
        cursor: pointer;
      }
      .frame .framecontext {
        display: none;
      }
      .frame.more .framecontext {
        display: table-row;
      }
      .lineno {
        user-select: none;
        width: 1%;
        min-width: 50px;
        text-align: right;
      }
      .framecontext {
        user-select: none;
      }
      .frameline {
        user-select: none;
      }
      .noselect {
        user-select: none;
      }
    </style>
  </head>

  <body class="sans-serif w-100">
    <header
      class="bg-{% if status >= 500 or not status %}light-red{% else %}purple{% endif %}"
    >
      <div class="mw7 center">
        <h1 class="f1-ns f4 mt0 mb2 white-90">
          {% if response.stack %} {% if status %}<code
            class="f3-ns bg-white normal br3 pv1 ph2 v-mid {% if status >= 500 %}red{% elif status >= 400 %}purple{% endif %}"
            >{{ status }}</code
          >
          {% endif %}{{ response.name }} at {{ context.url.pathname }} {% elif
          renderError %} {{ renderError.name }} at {{ context.url.pathname }} {%
          else %} Unknown error at {{ context.url.pathname }} {% endif %}
        </h1>
        <h2 class="f2-ns f5 mt0 mb2 white-80">
          {% if response.stack %} {{ response.message }} {% elif renderError %}
          {{ renderError.message }} {% endif %}
        </h2>

        <table class="f6 white">
          <tr>
            <td class="tr white-80 v-top pr2">Request Method</td>
            <td><code>{{ context.method }}</code></td>
          </tr>
          <tr>
            <td class="tr white-80 v-top pr2">Request URL</td>
            <td><code>{{ context.url }}</code></td>
          </tr>
          {% if context.handler.route %}
          <tr>
            <td class="tr white-80 v-top pr2">Handler</td>
            <td>
              <a
                class="link underline washed-blue dim"
                href="{{ context.handler.location }}"
                ><code>{{ context.handler.name }}</code></a
              >, mounted at
              <code
                >{{ context.handler.method }} {{ context.handler.route }}</code
              >
            </td>
          </tr>
          {% endif %}
          <tr>
            <td class="tr white-80 v-top pr2">Honeycomb Trace</td>
            <td>
              {% if context._honeycombTrace %}
              <a
                class="link underline washed-blue dim"
                target="_blank"
                rel="noreferrer noopener"
                href="{{ context.traceURL }}"
              >
                Available
              </a>
              {% else %}
              <details>
                <summary>Not available.</summary>
                Make sure the <code>HONEYCOMB_DATASET</code>,
                <code>HONEYCOMB_WRITEKEY</code>, and
                <code>HONEYCOMB_TEAM</code> environment variables are set,
                then restart boltzmann.
              </details>
              {% endif %}
            </td>
          </tr>
          <tr>
            <td class="tr white-80 v-top pr2">Handler Version</td>
            <td><code>{{ context.handler.version|default("*") }}</code></td>
          </tr>
          <tr>
            <td class="tr white-80 v-top pr2">Application Middleware</td>
            <td>
              <ol class="mv0 ph0" style="list-style-position: inside">
                {% for middleware in context._middleware %}
                <li>
                  <a
                    class="link underline washed-blue dim"
                    target="_blank"
                    rel="noopener noreferrer"
                    href="{{ middleware.location }}"
                    ><code>{{ middleware.name }}</code></a
                  >
                </li>
                {% else %}
                <li class="list">No application middleware installed.</li>
                {% endfor %}
              </ol>
            </td>
          </tr>
          <tr>
            <td class="tr white-80 v-top pr2">Handler Middleware</td>
            <td>
              {% if context.handler.middleware %}
              <ol class="mv0 ph0" style="list-style-position: inside">
                {% for middleware in context.handler.middleware %}
                <li><code>{{ middleware }}</code></li>
                {% else %}
                <li class="list">No handler-specific middleware installed.</li>
                {% endfor %}
              </ol>
              {% endif %}
            </td>
          </tr>
          <tr>
            <td class="tr white-80 v-top pr2">Template paths</td>
            <td>
              <ol class="mv0 ph0" style="list-style-position: inside">
                {% for path in template_paths %}
                <li><code>{{ path }}</code></li>
                {% endfor %}
              </ol>
            </td>
          </tr>
          <tr>
            <td class="tr white-80 v-top pr2">Boltzmann Version</td>
            <td>${boltzmannVersion}</td>
          </tr>
          <tr>
            <td class="tr white-80 v-top pr2">Node Version</td>
            <td>${process.versions.node}</td>
          </tr>
        </table>

        <aside class="pv3-l i f6 white-60 lh-copy">
          You&#39;re seeing this page because you are in dev mode. {% if
          context.method == "GET" %}
          <a class="link underline washed-blue dim" href="?__production=1"
            >Click here</a
          >
          to see the production version of this error, or {% endif %} set the
          <code>NODE_ENV</code> environment variable to
          <code>production</code> and restart the server.
        </aside>
      </div>
    </header>

    {% if response.__noMatch %}
    <section id="routes" class="bg-light-gray black-90">
      <div class="mw7 center pb3-l">
        <aside class="pv3-l i f6 black-60 lh-copy">
          The following routes are available:
        </aside>
        <table class="collapse w-100 frame">
          {% for name, handler in context._handlers %}
          <tr>
            <td>
              {% if handler.method.constructor.name == "Array" %} {% for method
              in handler.method %}
              <code>{{ method }}</code>{% if not loop.last %}, {% endif %} {%
              endfor %} {% else %}
              <code>{{ handler.method }}</code>
              {% endif %}
            </td>
            <td>
              <code>{{ handler.route }}</code>
            </td>
            <td>
              <code>{{ handler.name }}</code>
            </td>
          </tr>
          {% if handler.route == context.url.pathname %}
          <tr>
            <td><aside class="i f6 lh-copy black-40">↪︎</aside></td>
            <td colspan="2">
              <aside class="i f6 lh-copy black-40">
                Are you trying to access this route, which is available at a
                different method or version?
              </aside>
            </td>
          </tr>
          {% endif %} {% endfor %}
        </table>
      </div>
    </section>
    {% endif %}

    <section
      id="stacktrace"
      class="bg-washed-{% if status >= 500 or not status %}yellow{% else %}blue{% endif %} black-90"
    >
      <div class="mw7 center">
        {% if response.stack %}
        <div class="rich">
          <h3 class="f3-ns f5 mt0 pt2">
            Stack trace from error
            <button
              class="input-reset bn pointer"
              onclick="javascript:window.stacktrace.classList.toggle('paste');"
            >
              Switch to copy-and-paste view
            </button>
          </h3>
          {% if frames %} {% for frame in frames %}

          <p>
            <a
              href="vscode://file/{{ frame.getFileName() }}:{{ frame.getLineNumber() }}:{{ frame.getColumnNumber() }}"
              target="_blank"
              ><code>{{ frame.getRelativeFileName() }}</code></a
            >, line {{ frame.getLineNumber() }}, at
            <code>{{ frame.getFunctionNameSanitized() }}</code>
          </p>

          {% if frame.context %}
          <table
            class="collapse w-100 frame"
            onclick="javascript:this.closest('table').classList.toggle('more')"
          >
            {% for line in frame.context.pre %}
            <tr class="framecontext black-40 bg-black-10">
              <td class="lineno pr2 tr f7 black-20">
                <pre
                  class="ma0"
                ><code>{{ frame.getLineNumber() - loop.revindex }}</code></pre>
              </td>
              <td>
                <pre class="ma0"><code>{{ line }}</code></pre>
              </td>
            </tr>
            {% endfor %}
            <tr class="frameline black-90 bg-black-10">
              <td class="lineno pr2 tr f7 black-20">
                <pre class="ma0"><code>{{ frame.getLineNumber() }}</code></pre>
              </td>
              <td>
                <pre class="ma0"><code>{{ frame.context.line }}</code></pre>
              </td>
            </tr>
            <tr class="frameline black-90 bg-black-10">
              <td class="lineno pr2 tr f7 black-20">
                <pre class="ma0"><code></code></pre>
              </td>
              <td>
                <pre
                  class="ma0"
                ><code class="red">{{ "^"|indent(frame.getColumnNumber() - 1, true)|replace(" ", "-") }}</code></pre>
              </td>
            </tr>
            {% for line in frame.context.post %}
            <tr class="framecontext black-40 bg-black-10">
              <td class="lineno pr2 tr f7 black-20">
                <pre
                  class="ma0"
                ><code>{{ frame.getLineNumber() + loop.index }}</code></pre>
              </td>
              <td>
                <pre class="ma0"><code>{{ line }}</code></pre>
              </td>
            </tr>
            {% endfor %}
          </table>
          {% else %} {% endif %} {% endfor %} {% else %}
          <h1>
            <code>{{ response.name }}</code>:
            <code>{{ response.message }}</code>
          </h1>
          <pre><code>{{ response.stack }}</code></pre>
          <aside class="pv3-l i f6 white-60 lh-copy">
            The <code>.stack</code> property was accessed by other code before
            the template middleware received it. As a result, we cannot display
            a rich stack trace.
          </aside>
          {% endif %} {% endif %} {% if renderError %}
          <h3 class="f3-ns f5 mt0 pt2">
            Caught error rendering <code>{{ template }}</code>
          </h3>
          {% if "template not found" in renderError.message %}
          <aside class="pv3-l i f6 black-60 lh-copy">
            Caught <code>{{ renderError.message }}</code>. Tried the following
            paths:
          </aside>
          <ol class="mv0 ph0" style="list-style-position: inside">
            {% for path in template_paths %}
            <li><code>{{ path }}/{{ template }}</code></li>
            {% endfor %}
          </ol>
          {% else %}
          <pre><code>{{ renderError.stack }}</code></pre>
          {% endif %}
          <br />
          {% endif %}
        </div>

        <div class="copy-and-paste">
          <h3 class="f3-ns f5 mt0 pt2">
            Stack trace from error
            <button
              class="input-reset bn pointer"
              onclick="javascript:window.stacktrace.classList.toggle('paste');"
            >
              Switch back to interactive view
            </button>
          </h3>
          <textarea class="w-100 h5-l">
{{ response.stack }}{% if response.stack %}
{% endif %}{{ renderError.stack }}</textarea
          >
        </div>
      </div>
    </section>

    <section id="data" class="bg-light-gray black-90">
      <div class="mw7 center">
        <h3 class="f3-ns f5 mt0 pt2">Request Information</h3>
        {% if context.params %}
        <div class="flex flex-wrap">
          <h4 class="noselect mt0 tr w-10 mr2">URL Params</h4>
          <table class="collapse w-80 v-top">
            {% for name, value in context.params %}
            <tr>
              <td class="pb2 w-20 v-top tr pr4">
                <code class="black-60 i">{{ name }}</code>
              </td>
              <td class="pb2 v-top"><code>{{ value }}</code></td>
            </tr>
            {% endfor %}
          </table>
        </div>
        {% endif %}

        <div class="flex flex-wrap">
          <h4 class="noselect mt0 tr w-10 mr2">URL Query String</h4>
          <table class="collapse w-80 v-top">
            {% for name, value in context.query %}
            <tr class="striped--light-gray">
              <td class="pb2 w-20 v-top tr pr4">
                <code class="black-60 i">{{ name }}</code>
              </td>
              <td class="pb2 v-top"><code>{{ value }}</code></td>
            </tr>
            {% endfor %}
          </table>
        </div>

        <div class="flex flex-wrap">
          <h4 class="noselect mt0 tr w-10 mr2">Request Headers</h4>
          <table class="collapse w-80">
            {% for name, value in context.headers %}
            <tr class="striped--light-gray">
              <td class="pb2 w-20 v-top tr pr4">
                <code class="black-60 i">{{ name }}:</code>
              </td>
              <td class="pb2 v-top"><code>{{ value }}</code></td>
            </tr>
            {% endfor %}
          </table>
        </div>

        <hr />

        <h3 class="f3-ns f5 mt0 pt2">Response Information</h3>
        <aside class="pb3-l i f6 black-60 lh-copy">
          Response was{% if not threw %} not{% endif %} thrown.
        </aside>
        <div class="flex flex-wrap">
          <h4 class="noselect mt0 tr w-10 mr2">Status</h4>
          <pre
            class="mt0"
          ><a href="https://httpstatus.es/{{ status }}"><code>{{ status }}</code></a></pre>
        </div>

        {% if template %}
        <div class="flex flex-wrap">
          <h4 class="noselect mt0 tr w-10 mr2">Template</h4>
          <pre class="mt0"><code>{{ template }}</code></pre>
        </div>
        {% endif %}

        <div class="flex flex-wrap">
          <h4 class="noselect mt0 tr w-10 mr2">Response Data</h4>
          <pre class="mt0"><code>{{ response|dump(2) }}</code></pre>
        </div>

        <div class="flex flex-wrap">
          <h4 class="noselect mt0 tr w-10 mr2">Response Headers</h4>
          <pre class="mt0"><code>{{ headers|dump(2) }}</code></pre>
        </div>
      </div>
    </section>
  </body>
</html>
`
// {% endraw %}

function template ({
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
    xs => path.resolve(__dirname, xs)
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

  const devErrorTemplate = new nunjucks.Template(devErrorTemplateSource, env)

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


void `{% if selftest %}`;
import { promises as fs } from 'fs'
import tap from 'tap'
import {runserver} from '../bin/runserver'
import {inject} from '@hapi/shot'
/* c8 ignore next */
// {% raw %}
if (require.main === module) {
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
      {{ greeting }} world
    `.trim()
    )

    handler.route = 'GET /'
    const server = await runserver({
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
      {{ greeting|frobnify }} world
    `.trim()
    )

    handler.route = 'GET /'
    const server = await runserver({
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
      {% frob %}{{ greeting }} world{% endfrob %}
    `.trim()
    )

    handler.route = 'GET /'
    const server = await runserver({
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
      {{ greeting|frobnify }} world
    `.trim()
    )

    handler.route = 'GET /'
    const server = await runserver({
      middleware: [
        [
          template,
          {
            paths: [path.join(__dirname, 'templates'), path.resolve(__dirname, '..', '..')],
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
      {{ greeting|frobnify }} world
    `.trim()
    )

    handler.route = 'GET /'
    const server = await runserver({
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

// {% endraw %}
}
void `{% endif %}`;
