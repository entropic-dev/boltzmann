function buildBodyParser (bodyParsers) {
  return [_attachContentType, ...bodyParsers].reduceRight((lhs, rhs) => rhs(lhs), request => {
    throw Object.assign(new Error('Cannot parse request body'), {
      [STATUS]: 415
    })
  })
}

function _attachContentType (next) {
  return request => {
    const [contentType, ...attrs] = (request.headers['content-type'] || 'application/octet-stream').split(';').map(xs => xs.trim())
    const params = new Map(attrs.map(xs => xs.split('=').map(ys => ys.trim())))
    const charset = (params.get('charset') || 'utf-8').replace(/^("(.*)")|('(.*)')$/, '$2$4').toLowerCase()
    const [type, vndsubtype = ''] = contentType.split('/')
    const subtypeParts = vndsubtype.split('+')
    const subtype = subtypeParts.pop()

    request.contentType = {
      vnd: subtypeParts.join('+'),
      type,
      subtype,
      charset,
      params
    }

    return next(request)
  }
}
