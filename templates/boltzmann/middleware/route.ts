// {% if selftest %}
import { Handler } from '../core/middleware'
import { Context } from '../data/context'
const STATUS = Symbol.for('status')
const HEADERS = Symbol.for('headers')
const TEMPLATE = Symbol.for('template')
const THREW = Symbol.for('threw')
import fmw from 'find-my-way'
// {% endif %}

/* {% if selftest %} */export /* {% endif %} */function route (handlers = {}) {
  const wayfinder = fmw({})

  return async (next: Handler) => {
    for (let handler of Object.values(handlers)) {
      if (typeof handler.route === 'string') {
        let [method, ...route] = handler.route.split(' ')
        route = route.join(' ')
        if (route.length === 0) {
          route = method
          method = (handler.method || 'GET')
        }
        const opts = {}
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
          handler = decorators.reduce((lhs, rhs) => {
            return [...lhs, enforceInvariants(), rhs]
          }, []).reduceRight((lhs, rhs) => rhs(lhs), enforceInvariants()(handler))
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

        wayfinder.on(method, route, opts, handler)
      }
    }

    return (context: Context) => {
      const { pathname } = context.url
      const match = wayfinder.find(context.request.method, pathname, ...(
        context.request.headers['accept-version']
        ? [{version: context.request.headers['accept-version']}]
        : []
      ))

      if (!match) {
        return next(context)
      }

      context.params = match.params
      context.handler = match.handler

      return next(context)
    }
  }
}
