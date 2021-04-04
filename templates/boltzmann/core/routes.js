async function routes (handlers) {
  const routes = []
  for (let [key, handler] of Object.entries(handlers)) {
    if (typeof handler.route === 'string') {
      let [method, ...route] = handler.route.split(' ')
      route = route.join(' ')
      if (route.length === 0) {
        route = method
        method = (handler.method || 'GET')
      }

      const { version, middleware, decorators, ...rest } = handler

      let location = null
      let link = null

      if (isDev()) {
        const getFunctionLocation = require('get-function-location')
        location = await getFunctionLocation(handler)
        link = `${location.source.replace('file://', 'vscode://file')}:${location.line}:${location.column}`
      }

      routes.push({
        key,
        location,
        link,
        method: handler.method || method || 'GET',
        route,
        version,
        middleware,
        handler,
        props: rest
      })
    }
  }

  return routes
}
