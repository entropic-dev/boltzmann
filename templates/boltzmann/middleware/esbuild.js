let _build = null
function esbuild({
  source = 'client',
  prefix = '_assets',
  staticUrl = process.env.STATIC_URL,
  destination = path.join(os.tmpdir(), crypto.createHash('sha1').update(__dirname).digest('hex')),
  options = {}
} = {}) {
  const logger = bole('boltzmann:esbuild')
  if (!isDev()) {
    return next => staticAssets(async function inner(context) {
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

  const staticAssets = staticfiles({
    prefix,
    dir: destination,
    addToContext: false,
    quiet: true
  })

  return async (next) => {
    await fs.mkdir(destination, { recursive: true })

    const routeMetadata = [...routes(await _requireOr('./handlers'))]

    const entries = await _findESBuildEntries(source)

    const start = Date.now()
    if (entries.size > 0) {
      _build = _build || require('esbuild').build
      await _build({
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

    return staticAssets(async function inner(context) {
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
