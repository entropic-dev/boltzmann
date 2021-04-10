const addAJVFormats = ajv => (require('ajv-formats')(ajv), ajv)
const addAJVKeywords = ajv => (require('ajv-keywords')(ajv), ajv)
const AJV = require('ajv')

function validateBody(schema, {
  ajv = addAJVFormats(addAJVKeywords(new AJV({
    useDefaults: true,
    allErrors: true,
    strictTypes: isDev() ? true : "log",
  }))),
} = {}) {
  const validator = ajv.compile(schema && schema.isFluentSchema ? schema.valueOf() : schema)
  return function validate (next) {
    return async (context, ...args) => {
      const subject = await context.body
      const valid = validator(subject)
      if (!valid) {
        context._body = Promise.reject(Object.assign(
          new Error('Bad request'),
          { errors: validator.errors, [STATUS]: 400 }
        ))
        context._body.catch(() => {})
      } else {
        context._body = Promise.resolve(subject)
      }

      return next(context, ...args)
    }
  }
}

function validateBlock(what) {
  return function validate(schema, {
    ajv = addAJVFormats(addAJVKeywords(new AJV({
      useDefaults: true,
      allErrors: true,
      coerceTypes: 'array',
      strictTypes: isDev() ? true : "log",
    }))),
  } = {}) {
    const validator = ajv.compile(schema && schema.isFluentSchema ? schema.valueOf() : schema)
    return function validate (next) {
      return async (context, params, ...args) => {
        const subject = what(context)
        const valid = validator(subject)
        if (!valid) {
          return Object.assign(new Error('Bad request'), {
            [THREW]: true,
            [STATUS]: 400,
            errors: validator.errors
          })
        }

        return next(context, params, ...args)
      }
    }
  }
}

const validate = {
  body: validateBody,
  query: validateBlock(ctx => ctx.query),
  params: validateBlock(ctx => ctx.params)
}
