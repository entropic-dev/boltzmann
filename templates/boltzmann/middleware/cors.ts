void `{% if selftest %}`;
import { HTTPMethod } from 'find-my-way'
import isDev from 'are-we-dev'

import { Handler } from '../core/middleware'
import { Context } from '../data/context'

export { handleCORS }
void `{% endif %}`;

/**{{- tsdoc(page="03-middleware.md", section="handlecors") -}}*/
function handleCORS ({
  origins = isDev() ? '*' : String(process.env.CORS_ALLOW_ORIGINS).split(','),
  methods = String(process.env.CORS_ALLOW_METHODS).split(',') as HTTPMethod[],
  headers = String(process.env.CORS_ALLOW_HEADERS).split(',')
}: {
  origins?: string[] | string,
  methods?: HTTPMethod[] | HTTPMethod,
  headers: string[] | string
}) {
  const originsArray = Array.isArray(origins) ? origins : [origins]
  const includesStar = originsArray.includes('*')

  return (next: Handler) => {
    return async function cors (context: Context) {
      if (!includesStar && !originsArray.includes(String(context.headers.origin))) {
        throw Object.assign(new Error('Origin not allowed'), {
          [Symbol.for('status')]: 400
        })
      }

      const response = (
        context.method === 'OPTIONS'
        ? Object.assign(Buffer.from(''), {
            [Symbol.for('status')]: 204,
          })
        : await next(context)
      )

      response[Symbol.for('headers')] = {
        'Access-Control-Allow-Origin': includesStar ? '*' : context.headers.origin,
        'Access-Control-Allow-Methods': ([] as any[]).concat(methods).join(','),
        'Access-Control-Allow-Headers': ([] as any[]).concat(headers).join(',')
      }

      return response
    }
  }
}
