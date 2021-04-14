// {% if selftest %}
import { MiddlewareConfig, Middleware, Adaptor, Handler } from '../core/middleware'
import { BodyParserDefinition, BodyParser, BodyInput } from '../core/body'
import { Context } from '../data/context'
import { routes } from '../core/routes'

// {% if esbuild %}
import { buildAssets } from '../bin/esbuild'
// {% endif %}
import { printRoutes } from '../bin/routes'
import { runserver } from '../bin/runserver'

import { urlEncoded } from '../body/urlencoded'
import { json } from '../body/json'

import { validate } from '../middleware/validators'
import { log } from '../middleware/log'
import { vary } from '../middleware/vary'
// {% if jwt %}
import { authenticateJWT } from '../middleware/jwt'
// {% endif %}

// {% if oauth %}
import { oauth, handleOAuthLogin, handleOAuthLogout, handleOAuthCallback } from '../middleware/oauth'
// {% endif %}
// {% if staticfiles %}
import { staticfiles } from '../middleware/staticfiles'
// {% endif %}
// {% if esbuild %}
import { esbuild } from '../middleware/esbuild'
// {% endif %}

// {% if templates %}
import { template } from '../middleware/template'
import { templateContext } from '../middleware/template-context'
// {% endif %}
import { applyXFO } from '../middleware/apply-headers'
import { handleCORS } from '../middleware/cors'
import { LoadSession, SaveSession, session } from '../middleware/session'
// {% if csrf %}
import { applyCSRF } from '../middleware/csrf'
// {% endif %}
import { BoltzmannTest, Test, test } from '../middleware/test'
// {% endif %}

const body = {
  json,
  urlEncoded,
  urlencoded: urlEncoded
}

const decorators = {
  validate,
  test
}

const middleware = {
  log,
  vary,
// {% if jwt %}
  authenticateJWT,
// {% endif %}

// {% if oauth %}
  oauth,
  handleOAuthLogin,
  handleOAuthLogout,
  handleOAuthCallback,
// {% endif %}
// {% if staticfiles %}
  staticfiles,
// {% endif %}
// {% if esbuild %}
  esbuild,
// {% endif %}

// {% if templates %}
  template,
  templateContext,
// {% endif %}
  applyXFO,
  handleCORS,
  session,
// {% if csrf %}
  applyCSRF,
// {% endif %}
  ...decorators // forwarding these here.
}

export {
  BodyInput,
  BodyParserDefinition,
  BodyParser,
  MiddlewareConfig,
  Middleware,
  LoadSession,
  SaveSession,
  Adaptor,
  Handler,
  BoltzmannTest,
  Test,

  Context,
  runserver as main,
  middleware,
  body,
  decorators,
  routes,
  printRoutes,
// {% if esbuild %}
  buildAssets
// {% endif %}
}
