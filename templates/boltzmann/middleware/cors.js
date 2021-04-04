
function handleCORS ({
  origins = isDev() ? '*' : String(process.env.CORS_ALLOW_ORIGINS).split(','),
  methods = String(process.env.CORS_ALLOW_METHODS).split(','),
  headers = String(process.env.CORS_ALLOW_HEADERS).split(',')
}) {
  origins = [].concat(origins)
  const includesStar = origins.includes('*')

  return next => {
    return async function cors (context) {
      if (!includesStar && !origins.includes(context.headers.origin)) {
        throw Object.assign(new Error('Origin not allowed'), {
          [Symbol.for('status')]: 400
        })
      }

      const response = (
        context.method === 'OPTIONS'
        ? Object.assign(Buffer.from(''), {
            [Symbol.for('status')]: 204,
          })
        : await next(context)
      )

      response[Symbol.for('headers')] = {
        'Access-Control-Allow-Origin': includesStar ? '*' : context.headers.origin,
        'Access-Control-Allow-Methods': [].concat(methods).join(','),
        'Access-Control-Allow-Headers': [].concat(headers).join(',')
      }

      return response
    }
  }
}
