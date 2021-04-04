function log ({
  logger = bole(process.env.SERVICE_NAME || 'boltzmann'),
  level = process.env.LOG_LEVEL || 'debug',
  stream = process.stdout
} = {}) {
  if (isDev()) {
    const pretty = require('bistre')({ time: true })
    pretty.pipe(stream)
    stream = pretty
  }
  bole.output({ level, stream })

  return function logMiddleware (next) {
    return async function inner (context) {
      const result = await next(context)

      const body = result || {}
      if (body && body[THREW] && body.stack) {
        logger.error(body)
      }

      logger.info({
        message: `${body[Symbol.for('status')]} ${context.request.method} ${
          context.request.url
        }`,
        id: context.id,
        ip: context.remote,
        host: context.host,
        method: context.request.method,
        url: context.request.url,
        elapsed: Date.now() - context.start,
        status: body[Symbol.for('status')],
        userAgent: context.request.headers['user-agent'],
        referer: context.request.headers.referer
      })

      return body
    }
  }
}
