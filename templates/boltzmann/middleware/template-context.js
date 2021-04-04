
function templateContext(extraContext = {}) {
  return next => {
    return async context => {
      const result = await next(context)

      if (Symbol.for('template') in result) {
        result.STATIC_URL = process.env.STATIC_URL || '/static'

        for (const [key, fn] of Object.entries(extraContext)) {
          result[key] = typeof fn === 'function' ? await fn(context) : fn
        }
      }

      return result
    }
  }
}
