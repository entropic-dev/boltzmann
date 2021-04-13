// {% if selftest %}
import bole from '@entropic-dev/bole'
import { build } from 'esbuild'
import isDev from 'are-we-dev'
import crypto from 'crypto'
import path from 'path'
import os from 'os'

import { promises as fs } from 'fs'
import { staticfiles } from '../middleware/staticfiles'
import { _findESBuildEntries } from '../bin/esbuild'
import { Handler } from '../core/middleware'
import { Context } from '../data/context'
import { routes } from '../core/routes'
import { _requireOr } from '../utils'
// {% endif %}

/* {% if selftest %} */export /* {% endif %} */function esbuild({
  source = 'client',
  prefix = '_assets',
  staticUrl = process.env.STATIC_URL,
  destination = path.join(os.tmpdir(), crypto.createHash('sha1').update(__dirname).digest('hex')),
  options = {}
} = {}) {
  const logger = bole('boltzmann:esbuild')
  if (!isDev()) {
    return async (next: Handler) => {
      const entries = await _findESBuildEntries(source)
      return staticAssets(async function inner(context: Context) {
        const response = await next(context)
        if (!response[Symbol.for('template')]) {
          return response
        }

        const entry = entries.get(context.handler)
        if (!entry) {
          return response
        }

        response.ESBUILD_ENTRY_URL = `/${prefix}/${entry.replace(/\\/g, '/')}`
        return response
      })
    }
  }

  const staticAssets = staticfiles({
    prefix,
    dir: destination,
    addToContext: false,
    quiet: true
  })

  return async (next: Handler) => {
    await fs.mkdir(destination, { recursive: true })

    const _routeMetadata = [...routes(await _requireOr('./handlers', {}))]

    const entries = await _findESBuildEntries(source)

    const start = Date.now()
    if (entries.size > 0) {
      await build({
        sourcemap: 'inline',
        define: {
          'process.env': 'false',
        },
        minify: true,
        format: 'esm',
        splitting: true,
        bundle: true,
        ...options,
        entryPoints: [...new Set(entries.values())].map((value) => path.join(source, value)),
        outdir: destination,
      })
    }
    logger.info(`esbuild development middleware active; built in ${Date.now() - start}ms`)

    return staticAssets(async function inner(context: Context) {
      const response = await next(context)
      if (!response[Symbol.for('template')]) {
        return response
      }

      const entry = entries.get(context.handler)
      if (!entry) {
        return response
      }

      response.ESBUILD_ENTRY_URL = `/${prefix}/${entry.replace(/\\/g, '/')}`
      return response
    })
  }
}
