// {% if selftest %}
import bole from '@entropic/bole'
import isDev from 'are-we-dev'

import { runserver } from './bin/runserver'
import { Handler, MiddlewareConfig } from './core/middleware'
import { Context } from './data/context'
import { trace } from './middleware/honeycomb'
import { livereload } from './middleware/livereload'
import { log } from './middleware/log'
import { handlePing } from './middleware/ping'
import { attachPostgres } from './middleware/postgres'
import { attachRedis } from './middleware/redis'
import { handleStatus } from './middleware/status'
import { _processMiddleware, _requireOr } from './utils'
// {% endif %}

/* istanbul ignore next */
if (require.main === module && !process.env.TAP) {
  function passthrough() {
    return (next: Handler) => (context: Context) => next(context)
  }

  runserver({
    middleware: (_requireOr('./middleware', [] as MiddlewareConfig[]) as Promise<MiddlewareConfig[]>)
      .then(_processMiddleware)
      .then((mw) =>
        [
          // {% if honeycomb %}
          trace ,
          // {% endif %}
          // {% if ping %}
          handlePing ,
          // {% endif %}
          // {% if livereload %}
          (isDev() ? livereload : passthrough) ,
          // {% endif %}
          log ,

          // {% if redis %}
          attachRedis ,
          // {% endif %}
          // {% if postgres %}
          attachPostgres ,
          // {% endif %}
          ...mw,
          // {% if status %}
          ...[handleStatus ],
          // {% endif %}
        ].filter(Boolean)
      ),
  })
    .then((server) => {
      server.listen(Number(process.env.PORT) || 5000, () => {
        const addrinfo = server.address()
        if (!addrinfo) {
          return
        }
        bole('boltzmann:server').info(`now listening on port ${typeof addrinfo == 'string' ? addrinfo : addrinfo.port}`)
      })
    })
    .catch((err) => {
      console.error(err.stack)
      process.exit(1)
    })
}
