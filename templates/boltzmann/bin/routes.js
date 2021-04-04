async function printRoutes () {
  const metadata = [...routes(await _requireOr('./handlers'))]

  const maxRouteLen = metadata.reduce((acc, { route }) => Math.max(acc, route.length), 0)
  const maxHandlerLen = metadata.reduce((acc, { handler, key }) => Math.max(acc, (handler.name || key).length), 0)
  const maxMethodLen = metadata
    .map(({method}) => [].concat(method))
    .flat()
    .reduce((acc, method) => Math.max(acc, method.length), 0)

  const map = {
    'GET': '\x1b[32;1m',
    'DELETE': '\x1b[31m',
    'POST': '\x1b[33;1m',
    'PATCH': '\x1b[33;1m',
    'PUT': '\x1b[35;1m',
    '*': '\x1b[36;1m'
  }

  const ansi = require('ansi-escapes')
  const supportsHyperlinks = require('supports-hyperlinks')

  for (const meta of metadata) {
    for (let method of [].concat(meta.method)) {
      const originalMethod = method.toUpperCase().trim()
      method = `${(map[originalMethod] || map['*'])}${originalMethod}\x1b[0m`
      method = method + ' '.repeat(Math.max(0, maxMethodLen - originalMethod.length + 1))

      const rlen = meta.route.trim().length
      const route = meta.route.trim().replace(/:([^\/-]+)/g, (a, m) => {
        return `\x1b[4m:${m}\x1b[0m`
      }) + ' '.repeat(Math.max(0, maxRouteLen - rlen) + 1)

      const handler = (meta.handler.name || meta.key).padEnd(maxHandlerLen + 1)

      const source = meta.location.source.replace(`file://${process.cwd()}`, '.')
      let filename = `${source}:${meta.location.line}:${meta.location.column}`
      filename = (
        supportsHyperlinks.stdout
        ? ansi.link(filename, meta.link)
        : filename
      )

      console.log(`  ${method}${route}${handler} \x1b[38;5;8m(\x1b[4m${filename}\x1b[0m\x1b[38;5;8m)\x1b[0m`)
    }
  }

  if (supportsHyperlinks.stdout) {
    console.log()
    console.log('(hold ⌘ and click on any filename above to open in VSCode)')
  }
  console.log()
}


