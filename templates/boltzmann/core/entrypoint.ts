void `{% if selftest %}`;
import bole from '@entropic/bole'
import isDev from 'are-we-dev'

import { startOtelSdk } from '../core/prelude'
import { MiddlewareConfig } from '../core/middleware'
import { _processMiddleware, _requireOr } from '../core/utils'
import { attachPostgres } from '../middleware/postgres'
import { livereload } from '../middleware/livereload'
import { handleStatus } from '../middleware/status'
import { attachRedis } from '../middleware/redis'
import { handlePing } from '../middleware/ping'
import { trace } from '../middleware/honeycomb'
import { runserver } from '../bin/runserver'
import { log } from '../middleware/log'
void `{% endif %}`;

/* c8 ignore next */
if (require.main === module && !process.env.TAP) {
  // {% if honeycomb %}
  startOtelSdk().then(run)
  function run() {
  // {% endif %}

  runserver({
    middleware: (_requireOr('./middleware', [] as MiddlewareConfig[]) as Promise<MiddlewareConfig[]>)
      .then(_processMiddleware)
      .then((mw) => {
        // {# order matters here and typescript is eager to drop comments inside of array syntax #}
        // {# so we're gonna do this one flag at a time. #}
        const acc = []

        // {% if honeycomb %}
        acc.push(trace)
        // {% endif %}

        // {% if ping %}
        acc.push(handlePing)
        // {% endif %}

        // {% if livereload %}
        if (isDev()) {
          acc.push(livereload)
        }
        // {% endif %}

        acc.push(log)

        // {% if redis %}
        acc.push(attachRedis)
        // {% endif %}

        // {% if postgres %}
        acc.push(attachPostgres)
        // {% endif %}
        
        acc.push(...mw)

        // {% if status %}
        acc.push(handleStatus)
        // {% endif %}

        return acc.filter(Boolean)
      }),
  })
    .then((server) => {
      server.listen(Number(process.env.PORT) || 8000, () => {
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
  // {% if honeycomb %}
  }
  // {% endif %}
}
