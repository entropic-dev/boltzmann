// {% if selftest %}
import { Handler } from '../core/middleware'
import { Context } from '../data/context'
/* {% if redis %} */import redis from 'handy-redis'/* {% endif %} */
// {% endif %}

/* {% if selftest %} */export /* {% endif %} */function attachRedis ({ url = process.env.REDIS_URL } = {}) {
  return (next: Handler) => {
    const client = redis.createHandyClient({ url })
    return async function redis (context: Context) {
      context._redisClient = client
      return next(context)
    }
  }
}

