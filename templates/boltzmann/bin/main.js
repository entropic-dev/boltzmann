async function main ({
  middleware = _requireOr('./middleware', []).then(_processMiddleware),
  bodyParsers = _requireOr('./body', [urlEncoded, json]).then(_processBodyParsers),
  handlers = _requireOr('./handlers', {}),
} = {}) {
  [middleware, bodyParsers, handlers] = await Promise.all([
    middleware,
    bodyParsers,
    handlers,
  ])

  const server = http.createServer()
  let isClosing = false

  // When we're not in dev, handle SIGINT gracefully. Gracefully let open
  // connections complete, but let them know not to keep-alive!
  if (!isDev()) {
    process.on('SIGINT', () => {
      if (isClosing) {
        process.exit(1)
      }
      const logger = bole('boltzmann:server')
      logger.info('Caught SIGINT, preparing to shutdown. If running on the command line another ^C will close the app immediately.')
      isClosing = true
      server.close()
    })
  }

  const respond = await buildMiddleware([[route, handlers], ...middleware], handler)
  Context._bodyParser = buildBodyParser(bodyParsers)

  // {% if templates %}
  let _middleware = []
  if (isDev() && !process.env.TAP) {
    const getFunctionLocation = require('get-function-location')
    _middleware = await Promise.all(middleware.map(async xs => {
      const fn = (Array.isArray(xs) ? xs[0] : xs)
      const loc = await getFunctionLocation(fn)
      return {
        name: fn.name,
        location: `${loc.source.replace('file://', 'vscode://file')}:${loc.line}:${loc.column}`
      }
    }))
  }
  // {% endif %}

  server.on('request', async (req, res) => {
    const context = new Context(req, res)

    // {% if templates %}
    if (isDev()) {
      context._handlers = handlers
      context._middleware = _middleware
    }
    // {% endif %}

    let body = await respond(context)

    if (body[THREW]) {
      body = {
        message: body.message,
        [isDev() ? 'stack' : Symbol('stack')]: body.stack,
        [STATUS]: body[STATUS],
        [HEADERS]: body[HEADERS],
        ...body
      }
    }

    const isPipe = body && body.pipe
    const {
      [STATUS]: status,
      [HEADERS]: headers,
    } = body || {}

    if (context._cookie) {
      const setCookie = context._cookie.collect()
      if (setCookie.length) {
        headers['set-cookie'] = setCookie
      }
    }

    headers['x-clacks-overhead'] = 'GNU/Terry Pratchett'
    if (isClosing) {
      headers.connection = isClosing ? 'close' : 'keep-alive'
    }

    res.writeHead(status, headers)
    if (isPipe) {
      body.pipe(res)
    } else if (Buffer.isBuffer(body)) {
      res.end(body)
    } else if (body) {
      res.end(JSON.stringify(body))
    } else {
      res.end()
    }
  })

  return server
}
