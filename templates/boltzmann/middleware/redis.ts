void `{% if selftest %}`;
export { attachRedis }

import { Handler } from '../core/middleware'
import { Context } from '../data/context'
import * as redis from 'handy-redis'
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

void `{% if selftest %}`;
import tap from 'tap'
import { createServer } from 'net'
/* c8 ignore next */
if (require.main === module) {
  const { test } = tap

  test('attachRedis', async (assert) => {
    const server = createServer().listen(6379)
    assert.teardown(async () => {
      server.close()
    })

    test('attaches client', async (assert) => {
      const adaptor = attachRedis()
      const handler = adaptor(c => c)

      const context: Record<string, any> = {}
      const client = redis.createHandyClient({})
      client.end(false)
      const response = await handler(<any>context)
      assert.equal(response, context)
      assert.type(context._redisClient, <any>client.constructor)
      context._redisClient.end(false)
    })
  })
}
void `{% endif %}`;
