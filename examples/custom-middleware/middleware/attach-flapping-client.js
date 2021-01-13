'use strict'

module.exports = attachFlappingClient

const axios = require('axios')

function attachFlappingClient({ url = process.env.BING_URL || 'https://bing.com/', timeout = 1000 } = {}) {
  return async (next) => {
    // Sometimes you want to assert that a resource is _reachable_ before
    // starting the service. You can make the setup function _asynchronous_
    // so the server does not report healthy until setup is complete.
    const client = axios.create({
      baseURL: url,
      timeout,
    })

    const response = await client.get('/', {
      validateStatus(s) {
        return s < 500
      },
    })

    if (response.status !== 200) {
      throw new Error("Failed to startup because Bing didn't respond in a timely fashion")
    }

    return (context) => {
      context.myFlappingClient = client

      // if we don't await next, our request handler does not need to be async
      return next(context)
    }
  }
}
