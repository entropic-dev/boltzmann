// {% if selftest %}
import bole from '@entropic-dev/bole'
import isDev from 'are-we-dev'
import path from 'path'
import mime from 'mime'

import { templateContext } from './template-context'
import { Handler } from '../core/middleware'
import { Context } from '../data/context'
// {% endif %}

/* {% if selftest %} */ export /* {% endif %} */function staticfiles({
  prefix = 'static',
  dir = 'static',
  addToContext = true,
  fs = require('fs'),
  quiet = false,
} = {}) {
  const logger = bole('boltzmann:staticfiles')
  if (!isDev()) {
    return (
      addToContext
      ? templateContext({ STATIC_URL: process.env.STATIC_URL })
      : (next: Handler) => (context: Context) => next(context)
    )
  }

  dir = path.isAbsolute(dir) ? dir : path.join(__dirname, dir)

  return (next: Handler) => {
    if (!quiet) {
      logger.info(`Running in development mode; assets served from /${prefix}`)
    }

    const prefixURL = `/${prefix}/`
    const contextMiddleware = (
      addToContext
      ? templateContext({ STATIC_URL: prefixURL })
      : (next: Handler) => (context: Context) => next(context)
    )

    return contextMiddleware(async (context: Context) => {
      if (!context.url.pathname.startsWith(prefixURL)) {
        return next(context)
      }

      const target = path.join(dir, context.url.pathname.slice(1 + prefix.length))
      if (!target.startsWith(dir + path.sep)) {
        throw Object.assign(new Error('File not found'), {
          [Symbol.for('status')]: 404,
        })
      }

      const data = await new Promise((resolve, reject) => {
        const stream = fs
          .createReadStream(target)
          .on('open', () => resolve(stream))
          .on('error', reject)
      })
      const mimetype = mime.getType(path.extname(target))
      return Object.assign(data, {
        [Symbol.for('headers')]: {
          'content-type': mimetype || 'application/octet-stream',
        },
      })
    })
  }
}
