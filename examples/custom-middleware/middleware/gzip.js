'use strict'

module.exports = gzip

const zlib = require('zlib')

function gzip () {
  return next => {
    return async context => {
      const acceptEncoding = String(context.headers['accept-encoding'])
      if (!acceptEncoding.includes('gzip')) {
        return next(context)
      }

      const response = await next(context)
      const {
        [Symbol.for('status')]: status,
        [Symbol.for('headers')]: headers
      } = response

      if (Buffer.isBuffer(response) && response.length === 0) {
        return response
      }

      headers['content-encoding'] = 'gzip'
      const compressor = zlib.createGzip()

      // We are recapitulating what Boltzmann does with response objects here.
      // TODO: Expose this logic in some other fashion!
      compressor[Symbol.for('status')] = status
      compressor[Symbol.for('headers')] = headers
      if (response && response.pipe) {
        response.pipe(compressor)
      } else if (Buffer.isBuffer(response)) {
        compressor.end(response)
      } else {
        compressor.end(JSON.stringify(response))
      }

      return compressor
    }
  }
}
