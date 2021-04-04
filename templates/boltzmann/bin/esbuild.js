async function _findESBuildEntries (source) {
  const routeMetadata = [...routes(await _requireOr('./handlers'))]

  const entries = new Map()
  for (const route of routeMetadata) {
    if (![].concat(route.props.method).some(xs => xs === 'GET' || xs === 'POST')) {
      continue
    }

    const basename = route.props.entry || route.handler.name || route.key
    const filepath = path.join(source, basename)
    for (const suffix of ['.js', '.jsx', '.ts', '.tsx']) {
      const entrypoint = `${filepath}${suffix}`
      const stats = await fs.stat(entrypoint).catch(_ => null)
      if (stats && stats.isFile()) {
        entries.set(route.handler, `${basename}${suffix}`)
        break
      }
    }
  }

  return entries
}

async function buildAssets (
  destination = 'build',
  middleware = _requireOr('./middleware', []).then(_processMiddleware),
  handlers = _requireOr('./handlers', {})
) {
  middleware = await middleware
  let [, config = {}] = [].concat(middleware.find(xs => esbuild === (Array.isArray(xs) ? xs[0] : xs)))

  config = {
    source: 'client',
    prefix: '_assets',
    staticUrl: process.env.STATIC_URL,
    destination,
    options: {},
    ...config,
  }

  // XXX(CD): at the time of writing, router desugars handler properties into their canonical attributes.
  // Eventually the `routes()` function should do this, and the main function should rely on routes().
  await (routing(await handlers)(() => {}))

  const entries = await _findESBuildEntries(config.source)

  const esbuildConfig = {
    sourcemap: 'external',
    define: {
      'process.env': 'false',
    },
    minify: true,
    format: 'esm',
    splitting: true,
    bundle: true,
    ...config.options,
    entryPoints: [...new Set(entries.values())].map((value) => path.join(config.source, value)),
    outdir: destination,
  }

  if (entries.size > 0) {
    _build = _build || require('esbuild').build
    await _build(esbuildConfig)
  }
}
