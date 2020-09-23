'use strict'

const boltzmann = require('./boltzmann')

module.exports = {
  APP_MIDDLEWARE: [
    [
      boltzmann.middleware.applyCSRF,
      {
        cookieSecret: process.env.COOKIE_SECRET || "it's a secret to everyone".repeat(2),
      },
    ],
    [boltzmann.middleware.applyXFO, 'DENY'],
    [
      boltzmann.middleware.session,
      {
        secret: 'wow a great secret, just amazing'.repeat(2),
        salt: 'potassium',
      },
    ],
    boltzmann.middleware.template,
    [
      boltzmann.middleware.templateContext,
      {
        user: async (context) => (await context.session).get('user'),
      },
    ],
  ],
}
