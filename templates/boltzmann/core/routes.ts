void `{% if selftest %}`;
import { HTTPMethod } from 'find-my-way'
import isDev from 'are-we-dev'

import { Handler } from './middleware'

export { routes }
void `{% endif %}`;

async function routes (handlers: Record<string, Handler>) {
  const routes = []
  for (let [key, handler] of Object.entries(handlers)) {
    if (typeof handler.route === 'string') {
      const [methodPart, ...routeParts] = handler.route.split(' ')
      const route = routeParts.length === 0 ? methodPart : routeParts.join(' ')
      const method = route.length === 0 ? ([] as HTTPMethod[]).concat(handler.method as HTTPMethod) || ['GET'] : methodPart as HTTPMethod

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
        method: ([] as HTTPMethod[]).concat(handler.method as HTTPMethod || method || 'GET' as 'GET'),
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
