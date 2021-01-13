'use strict'

module.exports = attachClient

const axios = require('axios')

function attachClient({ url }) {
  return (next) => {
    // this part only runs once!
    const client = axios.create({
      baseURL: url,
      timeout: 1000,
    })

    return async (context) => {
      // this part runs on every request!
      context.myClient = client
      return next(context)
    }
  }
}
