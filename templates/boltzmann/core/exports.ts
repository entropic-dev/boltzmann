void `{% if selftest %}`
import { MiddlewareConfig, Middleware, Adaptor, Handler, Response } from '../core/middleware'
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
// {% if livereload %}
import { livereload } from '../middleware/livereload'
// {% endif %}

// {% if oauth %}
import { oauth, handleOAuthLogin, handleOAuthLogout, handleOAuthCallback } from '../middleware/oauth'
// {% endif %}
// {% if staticfiles or esbuild %}
import { staticfiles } from '../middleware/staticfiles'
// {% endif %}
// {% if esbuild %}
import { esbuild } from '../middleware/esbuild'
// {% endif %}

// {% if templates %}
import { template } from '../middleware/template'
import { templateContext } from '../middleware/template-context'
// {% endif %}
import { applyHeaders, applyXFO } from '../middleware/apply-headers'
import { handleCORS } from '../middleware/cors'
import { LoadSession, SaveSession, session } from '../middleware/session'
// {% if csrf %}
import { applyCSRF } from '../middleware/csrf'
// {% endif %}
import { BoltzmannTest, Test, test } from '../middleware/test'

import { route } from '../middleware/route'
void `{% endif %}`

const body = {
  json,
  urlEncoded,
  urlencoded: urlEncoded,
}

const decorators = {
  validate,
  test,
}

const middleware = {
  /**{{- tsdoc(page="03-middleware.md", section="log") -}}*/
  log,
  /**{{- tsdoc(page="03-middleware.md", section="vary") -}}*/
  vary,
  // {% if jwt %}
  /**{{- tsdoc(page="03-middleware.md", section="authenticatejwt") -}}*/
  authenticateJWT,
  // {% endif %}

  /**{{- tsdoc(page="03-middleware.md", section="route") -}}*/
  route,
  // {% if oauth %}
  /**{{- tsdoc(page="03-middleware.md", section="oauth") -}}*/
  oauth,
  handleOAuthLogin,
  handleOAuthLogout,
  handleOAuthCallback,
  // {% endif %}
  // {% if staticfiles or esbuild %}
  /**{{- tsdoc(page="03-middleware.md", section="staticfiles") -}}*/
  staticfiles,
  // {% endif %}
  // {% if esbuild %}
  /**{{- tsdoc(page="03-middleware.md", section="esbuild") -}}*/
  esbuild,
  // {% endif %}

  // {% if livereload %}
  /**{{- tsdoc(page="03-middleware.md", section="livereload") -}}*/
  livereload,
  // {% endif %}

  // {% if templates %}
  /**{{- tsdoc(page="03-middleware.md", section="template") -}}*/
  template,
  /**{{- tsdoc(page="03-middleware.md", section="templatecontext") -}}*/
  templateContext,
  // {% endif %}
  /**{{- tsdoc(page="03-middleware.md", section="applyheaders") -}}*/
  applyHeaders,

  applyXFO,
  /**{{- tsdoc(page="03-middleware.md", section="handlecors") -}}*/
  handleCORS,
  /**{{- tsdoc(page="03-middleware.md", section="session") -}}*/
  session,
  // {% if csrf %}
  /**{{- tsdoc(page="03-middleware.md", section="applycsrf") -}}*/
  applyCSRF,
  // {% endif %}

  /**{{- tsdoc(page="03-middleware.md", section="test") -}}*/
  test,
  validate,
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
  Handler as Next,
  Response,
  BoltzmannTest,
  Test,
  Context,
  runserver as main,
  middleware,
  body,
  decorators,
  routes,
  printRoutes,
}

// {% if esbuild %}
export { buildAssets }
// {% endif %}
