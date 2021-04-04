const body = {
  json,
  urlEncoded
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

exports.Context = Context
exports.main = main
exports.middleware = middleware
exports.body = body
exports.decorators = decorators
exports.routes = routes
exports.printRoutes = printRoutes
// {% if esbuild %}
exports.buildAssets = buildAssets
// {% endif %}
