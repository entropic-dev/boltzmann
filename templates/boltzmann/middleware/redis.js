function attachRedis ({ url = process.env.REDIS_URL } = {}) {
  return next => {
    const client = redis.createHandyClient({ url })
    return async function redis (context) {
      context._redisClient = client
      return next(context)
    }
  }
}

