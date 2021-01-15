'use strict'

const { Context } = require('./boltzmann.js')

define.route = 'GET /:query'
async function define(/** @type {Context} */ context) {
  const q = context.params.query
  const response = await context.myClient.get('/', {
    params: {
      q,
      format: 'json',
    },
  })

  const abstract = response.data.Abstract || response.data.AbstractText

  if (abstract) {
    return abstract
  }

  // plain-text responses with a statuscode or headers are a little
  // unwieldy: you have to turn the string into a buffer first.
  //
  // In the 200 case, they don't have to be turned into a buffer.
  return Object.assign(Buffer.from(`Could not find any info about "${q}"`), {
    [Symbol.for('status')]: 404,
  })
}

module.exports = {
  define,
}
