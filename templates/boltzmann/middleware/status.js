/* {% if selftest %} */export /* {% endif %} */function handleStatus ({
  git = process.env.GIT_COMMIT,
  reachability = {
    // {% if postgres %}
    postgresReachability,
    // {% endif %}
    // {% if redis %}
    redisReachability,
    // {% endif %}
  },
  extraReachability = _requireOr('./reachability', {})
} = {}) {
  return async next => {
    reachability = { ...reachability, ...await extraReachability }

    const hostname = os.hostname()
    let requestCount = 0
    const statuses = {}
    reachability = Object.entries(reachability)
    return async function monitor (context) {
      switch (context.url.pathname) {
        case '/monitor/status':
          const downstream = {}
          for (const [name, test] of reachability) {
            const meta = {status: 'failed', latency: 0, error: null}
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
async function postgresReachability (context, meta) {
  const client = await context.postgresClient
  meta.status = 'got-client'
  await client.query('select 1;')
}
// {% endif %}

// {% if redis %}
async function redisReachability (context, meta) {
  await context.redisClient.ping()
}
// {% endif %}
