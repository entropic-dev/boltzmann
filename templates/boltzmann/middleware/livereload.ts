// {% if selftest %}
import bole from '@entropic-dev/bole'
import { Readable } from 'stream'

import { Handler } from '../core/middleware'
import { Context } from '../data/context'
// {% endif %}

/* {% if selftest %} */ export /* {% endif %} */ function livereload({
  reloadPath = '/__livereload',
}: { reloadPath?: string } = {}) {
  const logger = bole('boltzmann:livereload')
  logger.info('live reload enabled!')
  const number = Date.now()
  return (next: Handler) => async (context: Context) => {
    if (context.url.pathname === reloadPath) {
      let active = false
      const stream = new Readable({
        read(_: number) {
          active = true
        },
      })

      const interval = setInterval(() => {
        if (active) {
          active = stream.push(`event: message\ndata: ${number}\n\n`)
        }
      }, 5000)

      stream
        .on('pause', () => (active = false))
        .once('error', () => clearInterval(interval))
        .once('end', () => clearInterval(interval))

      return Object.assign(stream, {
        [Symbol.for('headers')]: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
        },
      })
    }

    const response = await next(context)

    if (response[Symbol.for('headers')]['content-type'].startsWith('text/html')) {
      const src = `
        let last = null
        let retryCount = 0
        let retryBackoff = [500, 500, 1000, 1000, 5000, 5000, 10000, 30000, 0]
        function connect() {
          const url = ${JSON.stringify(reloadPath)}
          console.log('connecting to', url)
          const es = new EventSource(url)

          es.onerror = () => {
            es.onmessage = () => {}
            es.onerror = () => {}
            ++retryCount
            if (retryBackoff[retryCount]) {
              es.close()
              setTimeout(connect, retryBackoff[retryCount])
            } else {
              es.close()
              console.log(\`live reload inactive after \${retryBackoff.length} attempts\`)
            }
          }

          es.onmessage = ev => {
            retryCount = 0
            if (last && last !== ev.data) {
              es.onmessage = () => {}
              es.onerror = () => {}
              setTimeout(() => window.location.reload(), 100)
            }
            last = ev.data
          }
        }

        connect()
      `

      return Object.assign(Buffer.from(String(response).replace('</html>', `<script>${src}</script></html>`), 'utf8'), {
        [Symbol.for('status')]: response[Symbol.for('status')],
        [Symbol.for('headers')]: response[Symbol.for('headers')],
      })
    }

    return response
  }
}
