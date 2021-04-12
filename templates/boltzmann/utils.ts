// {% if selftest %}
import { IncomingMessage } from 'http'

import { MiddlewareConfig } from './core/middleware'
import { BodyParserDefinition } from './core/body'
// {% endif %}

/* {% if selftest %} */export /* {% endif %} */async function _collect (request: IncomingMessage) {
  const acc = []
  for await (const chunk of request) {
    acc.push(chunk)
  }
  return Buffer.concat(acc)
}

type MiddlewareImport = {APP_MIDDLEWARE: MiddlewareConfig[]} | MiddlewareConfig[]
/* {% if selftest %} */export /* {% endif %} */function _processMiddleware (middleware: MiddlewareImport): MiddlewareConfig[] {
  if (Array.isArray(middleware)) {
    return middleware
  } else {
    return middleware.APP_MIDDLEWARE
  }
}

type BodyImport = {APP_BODY_PARSERS: BodyParserDefinition[]} | BodyParserDefinition[]
/* {% if selftest %} */export /* {% endif %} */function _processBodyParsers (parsers: BodyImport) {
  if (Array.isArray(parsers)) {
    return parsers
  } else {
    return parsers.APP_BODY_PARSERS
  }
}

/* {% if selftest %} */export /* {% endif %} */async function _requireOr (target: string, value: any) {
  try {
    return require(target)
  } catch (err) {
    if (
      err.code === 'MODULE_NOT_FOUND' &&
      err.requireStack &&
      err.requireStack[0] === __filename
    ) {
      return value
    }
    throw err
  }
}

