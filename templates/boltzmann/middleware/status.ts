void `{% if selftest %}`;
export {
  ReachabilityResult,
  ReachabilityCheck,
  handleStatus
}

import os from 'os'
/* {% if redis %} */import { IHandyRedis } from 'handy-redis'/* {% endif %} */

import { serviceName, STATUS } from '../core/prelude'
import { Handler } from '../core/middleware'
import { Context } from '../data/context'
import { _requireOr } from '../core/utils'
void `{% endif %}`;

interface ReachabilityResult {
  status: 'failed' | 'healthy' | string,
  error: Error | null,
  latency: number
}

interface ReachabilityCheck {
  (context: Context, meta: ReachabilityResult): Promise<void> | void
}

const defaultReachability: Record<string, ReachabilityCheck> = {}
// {% if postgres %}
defaultReachability.postgresReachability = postgresReachability
// {% endif %}
// {% if redis %}
defaultReachability.redisReachability = redisReachability
// {% endif %}

/**{{- tsdoc(page="03-middleware.md", section="handlestatus") -}}*/
function handleStatus ({
  git = process.env.GIT_COMMIT,
  reachability = defaultReachability,
  extraReachability = _requireOr('./reachability', {})
}: {
  git?: string,
  reachability?: Record<string, ReachabilityCheck>,
  extraReachability?: Promise<Record<string, ReachabilityCheck>>,
} = {}) {
  return async (next: Handler) => {
    reachability = { ...reachability, ...await extraReachability }

    const hostname = os.hostname()
    let requestCount = 0
    const statuses: Record<number, number> = {}
    const reachabilityEntries = Object.entries(reachability)
    return async function monitor (context: Context) {
      switch (context.url.pathname) {
        case '/monitor/status':
          const downstream: Record<string, ReachabilityResult> = {}
          for (const [name, test] of reachabilityEntries) {
            const meta: ReachabilityResult = {status: 'failed', latency: 0, error: null}
            const start = Date.now()
            try {
              await test(context, meta)
              meta.status = 'healthy'
            } catch (err) {
              meta.error = err
            } finally {
              meta.latency = Date.now() - start
            }
            downstream[name] = meta
          }

          return {
            git,
            uptime: process.uptime(),
            service: serviceName,
            hostname,
            memory: process.memoryUsage(),
            downstream,
            stats: {
              requestCount,
              statuses
            }
          }

        default:
          ++requestCount
          const result = await next(context)
          const body = result || {}
          statuses[body[STATUS]] = statuses[body[STATUS]] || 0
          ++statuses[body[STATUS]]
          return result
      }
    }
  }
}

// {% if postgres or redis %}
// - - - - - - - - - - - - - - - -
// Reachability Checks
// - - - - - - - - - - - - - - - -
// {% endif %}
// {% if postgres %}
async function postgresReachability (context: Context, meta: ReachabilityResult) {
  const client = await context.postgresClient
  meta.status = 'got-client'
  await client.query('select 1;')
}
// {% endif %}

// {% if redis %}
async function redisReachability (context: Context, _: ReachabilityResult) {
  await context.redisClient.ping()
}
// {% endif %}
