// {% if selftest %}
import bole from '@entropic/bole'
import isDev from 'are-we-dev'

import { Handler, MiddlewareConfig } from '../core/middleware'
import { _processMiddleware, _requireOr } from '../core/utils'
import { attachPostgres } from '../middleware/postgres'
import { livereload } from '../middleware/livereload'
import { handleStatus } from '../middleware/status'
import { attachRedis } from '../middleware/redis'
import { handlePing } from '../middleware/ping'
import { trace } from '../middleware/honeycomb'
import { runserver } from '../bin/runserver'
import { Context } from '../data/context'
import { log } from '../middleware/log'
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
