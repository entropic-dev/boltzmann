async function buildMiddleware (middleware, router) {
  const middlewareToSplice = (
    isDev()
    ? (mw) => [
      // {% if honeycomb %}
      honeycombMiddlewareSpans(mw),
      // {% endif %}
      dev(mw),
      enforceInvariants()
    ]
    : (mw) => [
      // {% if honeycomb %}
      honeycombMiddlewareSpans(mw),
      // {% endif %}
      enforceInvariants()
    ]
  )
  const result = middleware.reduce((lhs, rhs) => {
    const [mw, ...args] = Array.isArray(rhs) ? rhs : [rhs]
    return [...lhs, ...middlewareToSplice(mw), mw(...args)]
  }, []).concat(middlewareToSplice({ name: 'router' }))

  // {% if honeycomb %}
  // drop the outermost honeycombMiddlewareSpans mw.
  result.shift()
  // {% endif %}
  return result.reduceRight(async (lhs, rhs) => {
    return rhs(await lhs)
  }, router)
}

async function handler (context) {
  // {% if honeycomb %}
  let span = null
  if (process.env.HONEYCOMBIO_WRITE_KEY) {
    span = beeline.startSpan({
      name: `handler: ${context.handler.name}`,
      'handler.name': context.handler.name,
      'handler.method': String(context.handler.method),
      'handler.route': context.handler.route,
      'handler.version': context.handler.version || '*',
      'handler.decorators': String(context.handler.decorators)
    })
  }

  try {
    // {% endif %}
    return await context.handler(context, context.params, {}, null)
    // {% if honeycomb %}
  } finally {
    if (process.env.HONEYCOMBIO_WRITE_KEY) {
      beeline.finishSpan(span)
    }
  }
  // {% endif %}
}


