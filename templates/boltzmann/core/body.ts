void `{% if selftest %}`;
import { IncomingMessage } from 'http'
export { ContentType, BodyInput, BodyParser, BodyParserDefinition, buildBodyParser }
void `{% endif %}`;

interface ContentType {
  contentType: {
    vnd: string,
    type: string,
    subtype: string,
    charset: string,
    params: Map<string, string>
  }
}

type BodyInput = IncomingMessage & ContentType;

interface BodyParser {
  (request: BodyInput): unknown | Promise<unknown>
}

interface BodyParserDefinition {
  (next: BodyParser): BodyParser
}

function buildBodyParser (bodyParsers: BodyParserDefinition[]): BodyParser {
  const parserDefs = [_attachContentType as BodyParserDefinition, ...bodyParsers]
  return parserDefs.reduceRight((lhs: BodyParser, rhs: BodyParserDefinition) => rhs(lhs), (_) => {
    throw Object.assign(new Error('Cannot parse request body'), {
      [Symbol.for('status')]: 415
    })
  })
}

function _attachContentType (next: BodyParser): BodyParser {
  return (request: IncomingMessage) => {
    const [contentType, ...attrs] = (
      request.headers['content-type'] ||
      'application/octet-stream'
    ).split(';').map(xs => xs.trim())
    const attrsTuples = attrs.map(
      xs => xs.split('=').map(
        ys => ys.trim()
      ).slice(0, 2) as [string, string]
    )
    const params = new Map(attrsTuples)
    const charset = (params.get('charset') || 'utf-8').replace(/^("(.*)")|('(.*)')$/, '$2$4').toLowerCase()
    const [type, vndsubtype = ''] = contentType.split('/')
    const subtypeParts = vndsubtype.split('+')
    const subtype = subtypeParts.pop() || ''

    const augmentedRequest: IncomingMessage & ContentType = Object.assign(request, {
      contentType: {
        vnd: subtypeParts.join('+'),
        type,
        subtype,
        charset,
        params
      }
    })

    return next(augmentedRequest)
  }
}
