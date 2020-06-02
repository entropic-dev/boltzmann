'use strict'

module.exports = [
  [attachClient, { url: process.env.GOOGLE_URL }],
  attachFlappingClient,
  gzip
]

function attachClient ({ url }) {
  return next => {
    // this part only runs once!
    const client = axios.create({
      baseURL: url,
      timeout: 1000
    })

    return async context => {
      // this part runs on every request!
      context.myClient = client
      return next(context)
    }
  }
}

function attachFlappingClient ({ url = process.env.BING_URL } = {}) {
  return async next => {
    // Sometimes you want to assert that a resource is _reachable_ before
    // starting the service. You can make the setup function _asynchronous_
    // so the server does not report healthy until setup is complete.
    const client = axios.create({
      baseURL: url,
      timeout: 1000
    })

    const response = await client.get('/')
    if (response.status !== 200) {
      throw new Error('Failed to startup because Bing didn\'t respond in a timely fashion')
    }

    return context => {
      context.myFlappingClient = client

      // if we don't await next, our request handler does not need to be async
      return next(context)
    }
  }
}

const zlib = require('zlib')
function gzip () {
  return next => {
    return async context => {
      if (!String(context.headers['accept-encoding']).includes('gzip')) {
        return next(context)
      }

      const response = await next(context)
      const {
        [Symbol.for('status')]: status,
        [Symbol.for('headers')]: headers
      } = response

      if (!response.length) {
        return response
      }

      headers['content-encoding'] = 'gzip'
      const compressor = zlib.createGzip()
      compressor[Symbol.for('status')] = status
      compressor[Symbol.for('headers')] = headers
      if (response && response.pipe) {
        response.pipe(compressor)
      } else if (Buffer.isBuffer(response)) {
        compressor.end(response)
      } else if (response) {
        headers['content-type'] = headers['content-type'] || 'application/json'
        compressor.end(JSON.stringify(response))
      } else {
        return response
      }

      return compressor
    }
  }
}
