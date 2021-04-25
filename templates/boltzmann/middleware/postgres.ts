void `{% if selftest %}`;
import { serviceName, THREW } from '../core/prelude'
import { Handler } from '../core/middleware'
import { Context } from '../data/context'
import pg from 'pg'
export { attachPostgres }
void `{% endif %}`;

/**{{- tsdoc(page="03-middleware.md", section="attachpostgres") -}}*/
function attachPostgres ({
  url = process.env.PGURL || `postgres://postgres@localhost:5432/${serviceName}`,
  max = Number(process.env.PGPOOLSIZE) || 20
} = {}) {
  return async (next: Handler) => {
    const pool = new pg.Pool({
      connectionString: url,
      max
    })

    // make sure we can connect.
    const testConn = await pool.connect()
    testConn.release()

    return async function postgres (context: Context) {
      context._postgresPool = pool
      const isTransaction = context.method !== 'GET' && context.method !== 'HEAD'
      if (isTransaction) {
        const client = await context.postgresClient
        await client.query('BEGIN;')
      }

      const result = await next(context)
      if (context._postgresConnection) {
        const client = await context._postgresConnection
        if (isTransaction) {
          await client.query(result[THREW] ? 'ROLLBACK' : 'COMMIT')
        }
        await <Promise<void>><unknown>(<pg.PoolClient>client).release()
      }
      return result
    }
  }
}
