void `{% if selftest %}`;
import { Handler } from '../core/middleware'
import { Context } from '../data/context'
import redis from 'handy-redis'
export { attachRedis }
void `{% endif %}`;

/**{{- tsdoc(page="03-middleware.md", section="attachredis") -}}*/
function attachRedis ({ url = process.env.REDIS_URL } = {}) {
  return (next: Handler) => {
    const client = redis.createHandyClient({ url })
    return async function redis (context: Context) {
      context._redisClient = client
      return next(context)
    }
  }
}

