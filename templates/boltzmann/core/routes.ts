// {% if selftest %}
import { HTTPMethod } from 'find-my-way'
import isDev from 'are-we-dev'

import { Handler } from './middleware'
// {% endif %}

/* {% if selftest %} */export /* {% endif %} */async function routes (handlers: Record<string, Handler>) {
  const routes = []
  for (let [key, handler] of Object.entries(handlers)) {
    if (typeof handler.route === 'string') {
      let [method, ...routeParts] = handler.route.split(' ')
      let route = routeParts.join(' ')
      if (route.length === 0) {
        route = method
        method = (handler.method as string || 'GET')
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
