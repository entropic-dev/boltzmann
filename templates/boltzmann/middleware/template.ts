// {% if selftest %}
import bole from '@entropic-dev/bole'
import isDev from 'are-we-dev'
import path from 'path'

import { ConfigureOptions, Extension } from 'nunjucks'

import { Handler } from '../core/middleware'
import { Context } from '../data/context'
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

