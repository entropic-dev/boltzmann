/* istanbul ignore next */
if (require.main === module) {
  main({
    middleware: _requireOr('./middleware', []).then(_processMiddleware).then(mw => [
      // {% if honeycomb %}
      trace,
      // {% endif %}
      // {% if ping %}
      handlePing,
      // {% endif %}
      // {% if livereload %}
      isDev() ? livereload : null,
      // {% endif %}
      log,

      // {% if redis %}
      attachRedis,
      // {% endif %}
      // {% if postgres %}
      attachPostgres,
      // {% endif %}
      ...mw,
      // {% if status %}
      ...[handleStatus]
      // {% endif %}
    ].filter(Boolean))
  }).then(server => {
    server.listen(Number(process.env.PORT) || 5000, () => {
      bole('boltzmann:server').info(`now listening on port ${server.address().port}`)
    })
  }).catch(err => {
    console.error(err.stack)
    process.exit(1)
  })
}
