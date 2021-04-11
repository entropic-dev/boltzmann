// {% if selftest %}
import { RouteOptions } from 'find-my-way'
import isDev from 'are-we-dev'
import fmw from 'find-my-way'
import { Handler as FMWHandler, HTTPVersion, HTTPMethod } from 'find-my-way'

import { enforceInvariants } from '../middleware/enforce-invariants'
import { Handler, Adaptor } from '../core/middleware'
import { buildMiddleware } from '../core/middleware'
import { buildBodyParser } from '../core/body'
import { Context } from '../data/context'
import { vary } from '../middleware/vary'
// {% endif %}

/* {% if selftest %} */export /* {% endif %} */function route (handlers: Record<string, Handler> = {}) {
  const wayfinder = fmw({})

  return async (next: Handler) => {
    for (let handler of Object.values(handlers)) {
      if (typeof handler.route === 'string') {
        let [method, ...routeParts] = handler.route.split(' ')
        let route = routeParts.join(' ')
        if (route.length === 0) {
          route = method
          method = (handler.method || 'GET') as string
        }
        const opts: RouteOptions = {}
        if (handler.version) {
          opts.constraints = { version: handler.version }
          handler.middleware = handler.middleware || []
          handler.middleware.push([vary, 'accept-version'])
        }

        const { version, middleware, decorators, bodyParsers, ...rest } = handler

        let location = null
        // {% if templates %}
        if (isDev()) {
          const getFunctionLocation = require('get-function-location')
          const loc = await getFunctionLocation(handler)
          location = `${loc.source.replace('file://', 'vscode://file')}:${loc.line}:${loc.column}`
        }
        // {% endif %}

        if (Array.isArray(decorators)) {
          handler = await decorators.reduce((lhs: Adaptor[], rhs: Adaptor) => {
            return [...lhs, enforceInvariants(), rhs]
          }, []).reduceRight(async (lhs, rhs) => rhs(await lhs), Promise.resolve(enforceInvariants()(handler) as Handler))
        }

        const bodyParser = (
          Array.isArray(bodyParsers)
          ? buildBodyParser(bodyParsers)
          : Context._bodyParser
        )

        if (Array.isArray(middleware)) {
          const name = handler.name
          handler = await buildMiddleware(middleware, handler)

          // preserve the original name, please
          Object.defineProperty(handler, 'name', { value: name })
        }

        Object.assign(handler, {
          ...rest,
          method: handler.method || method || 'GET',
          version,
          route,
          location,
          bodyParser,
          middleware: (middleware || []).map(xs => Array.isArray(xs) ? xs[0].name : xs.name),
          decorators: (decorators || []).map(xs => xs.name),
        })

        wayfinder.on(<HTTPMethod | HTTPMethod[]>method, route, opts, <FMWHandler<HTTPVersion.V1>><unknown>handler)
      }
    }

    return (context: Context) => {
      const { pathname } = context.url
      const method = context.request.method || 'GET'
      const match = wayfinder.find(method as HTTPMethod, pathname, ...(
        context.request.headers['accept-version']
        ? [{version: context.request.headers['accept-version']}]
        : []
      ))

      if (!match) {
        return next(context)
      }

      context.params = match.params
      context.handler = <Handler><unknown>match.handler

      return next(context)
    }
  }
}
