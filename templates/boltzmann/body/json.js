function json (next) {
  return async request => {
    if (
      request.contentType.type === 'application' &&
      request.contentType.subtype === 'json' &&
      request.contentType.charset === 'utf-8'
    ) {
      const buf = await _collect(request)
      try {
        return JSON.parse(String(buf))
      } catch {
        const message = (
          isDev()
          ? 'Could not parse request body as JSON (Did the request include a `Content-Type: application/json` header?)'
          : 'Could not parse request body as JSON'
        )

        throw Object.assign(new Error(message), {
          [STATUS]: 422
        })
      }
    }

    return next(request)
  }
}
