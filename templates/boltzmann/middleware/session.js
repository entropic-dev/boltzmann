let _uuid = null
let IN_MEMORY = new Map()
function session ({
  cookie = process.env.SESSION_ID || 'sid',
  secret = process.env.SESSION_SECRET,
  salt = process.env.SESSION_SALT,
  logger = bole('boltzmann:session'),
  load =
// {% if redis %}
  async (context, id) => JSON.parse(await context.redisClient.get(id) || '{}'),
// {% else %}
  async (context, id) => JSON.parse(IN_MEMORY.get(id)),
// {% endif %}
  save =
// {% if redis %}
  async (context, id, session) => {
    // Add 5 seconds of lag
    await context.redisClient.setex(id, expirySeconds + 5, JSON.stringify(session))
  },
// {% else %}
  async (context, id, session) => IN_MEMORY.set(id, JSON.stringify(session)),
// {% endif %}
  iron = {},
  cookieOptions = {},
  expirySeconds = 60 * 60 * 24 * 365
} = {}) {
  let _iron = null

  expirySeconds = Number(expirySeconds) || 0
  if (typeof load !== 'function') {
    throw new TypeError('`load` must be a function, got ' + typeof load)
  }

  if (typeof save !== 'function') {
    throw new TypeError('`save` must be a function, got ' + typeof save)
  }

  secret = Buffer.isBuffer(secret) ? secret : String(secret)
  if (secret.length < 32) {
    throw new RangeError('`secret` must be a string or buffer at least 32 units long')
  }

  salt = Buffer.isBuffer(salt) ? salt : String(salt)
  if (salt.length == 0) {
    throw new RangeError('`salt` must be a string or buffer at least 1 unit long; preferably more')
  }

  return next => {
    return async context => {
      let _session = null
      context._loadSession = async () => {
        if (_session) {
          return _session
        }

        const sessid = context.cookie.get(cookie)
        if (!sessid) {
          _session = new Session(null, [['created', Date.now()]])
          return _session
        }

        _iron = _iron || require('@hapi/iron')
        _uuid = _uuid || require('uuid')

        let clientId
        try {
          clientId = String(await _iron.unseal(sessid.value, secret, { ..._iron.defaults, ...iron }))
        } catch (err) {
          logger.warn(`removing session that failed to decrypt; request_id="${context.id}"`)
          _session = new Session(null, [['created', Date.now()]])
          return _session
        }

        if (!clientId.startsWith('s_') || !_uuid.validate(clientId.slice(2).split(':')[0])) {
          logger.warn(`caught malformed session; clientID="${clientId}"; request_id="${context.id}"`)
          throw new BadSessionError()
        }

        const id = `s:${crypto.createHash('sha256').update(clientId).update(salt).digest('hex')}`

        const sessionData = await load(context, id)
        _session = new Session(clientId, Object.entries(sessionData))

        return _session
      }

      const response = await next(context)

      if (!_session) {
        return response
      }

      if (!_session.dirty) {
        return response
      }

      _uuid = _uuid || require('uuid')

      const needsReissue = !_session.id || _session[REISSUE]
      const issued = Date.now()
      const clientId = needsReissue ? `s_${_uuid.v4()}:${issued}` : _session.id
      const id = `s:${crypto.createHash('sha256').update(clientId).update(salt).digest('hex')}`

      _session.set('modified', issued)
      await save(context, id, Object.fromEntries(_session.entries()))

      if (needsReissue) {
        _iron = _iron || require('@hapi/iron')

        const sealed = await _iron.seal(clientId, secret, { ..._iron.defaults, ...iron })

        context.cookie.set(cookie, {
          value: sealed,
          httpOnly: true,
          sameSite: true,
          maxAge: expirySeconds,
          ...(expirySeconds ? {} : {expires: new Date(Date.now() + 1000 * expirySeconds)}),
          ...cookieOptions
        })
      }

      return response
    }
  }
}

