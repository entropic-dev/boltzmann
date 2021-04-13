// {% if selftest %}
import isDev from 'are-we-dev'
import { Ajv } from 'ajv'
import ajv from 'ajv'

import { Handler } from '../core/middleware'
import { Context } from '../data/context'

const THREW = Symbol.for('threw')
// {% endif %}

const addAJVFormats = (validator: Ajv): Ajv => (require('ajv-formats')(validator), validator)
const addAJVKeywords = (validator: Ajv): Ajv => (require('ajv-keywords')(validator), validator)

function validateBody(schema: object, {
  ajv: validator = addAJVFormats(addAJVKeywords(new ajv(<any>{
    useDefaults: true,
    allErrors: true,
    strictTypes: isDev() ? true : "log",
  }))),
}: {
  ajv?: Ajv
} = {}) {
  const compiled = validator.compile(schema && (schema as any).isFluentSchema ? schema.valueOf() : schema)
  return function validate (next: Handler) {
    return async (context: Context) => {
      const subject = await context.body
      const valid = compiled(subject)
      if (!valid) {
        const newBody = Promise.reject(Object.assign(
          new Error('Bad request'),
          { errors: validator.errors, [STATUS]: 400 }
        ))
        newBody.catch(() => {})
        context.body = newBody
      } else {
        context.body = Promise.resolve(subject)
      }

      return next(context)
    }
  }
}

function validateBlock(what: (c: Context) => object) {
  return function validate(schema: object, {
    ajv: validator = addAJVFormats(addAJVKeywords(new ajv(<any>{
      useDefaults: true,
      allErrors: true,
      coerceTypes: 'array',
      strictTypes: isDev() ? true : "log",
    }))),
  }: {
    ajv?: Ajv
  } = {}) {
    const compiled = validator.compile(schema && (schema as any).isFluentSchema ? schema.valueOf() : schema)
    return function validate (next: Handler) {
      return async (context: Context) => {
        const subject = what(context)
        const valid = compiled(subject)
        if (!valid) {
          return Object.assign(new Error('Bad request'), {
            [THREW]: true,
            [STATUS]: 400,
            errors: validator.errors
          })
        }

        return next(context)
      }
    }
  }
}

/* {% if selftest %} */export /* {% endif %} */const validate = {
  body: validateBody,
  query: validateBlock(ctx => ctx.query),
  params: validateBlock(ctx => ctx.params)
}
