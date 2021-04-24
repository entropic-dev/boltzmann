// {% if selftest %}
import isDev from 'are-we-dev'
import Ajv from 'ajv'

import { Handler } from '../core/middleware'
import { Context } from '../data/context'
import { STATUS, THREW } from '../core/prelude'

export { validate }
// {% endif %}

const addAJVFormats = (validator: Ajv): Ajv => (require('ajv-formats')(validator), validator)
const addAJVKeywords = (validator: Ajv): Ajv => (require('ajv-keywords')(validator), validator)

/**{{- tsdoc(page="03-middleware.md", section="validate-body") -}}*/
function validateBody(schema: object, {
  ajv: validator = addAJVFormats(addAJVKeywords(new Ajv(<any>{
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
          { errors: compiled.errors, [STATUS]: 400 }
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
    ajv: validator = addAJVFormats(addAJVKeywords(new Ajv(<any>{
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
            errors: compiled.errors
          })
        }

        return next(context)
      }
    }
  }
}

/**{{- tsdoc(page="03-middleware.md", section="validate-query") -}}*/
const validateQuery = validateBlock(ctx => ctx.query)

/**{{- tsdoc(page="03-middleware.md", section="validate-params") -}}*/
const validateParams = validateBlock(ctx => ctx.params)

const validate = {
  body: validateBody,
  query: validateQuery,
  params: validateParams
}

/* {% if selftest %} */
import tap from 'tap'
import {runserver} from '../bin/runserver'
import {inject} from '@hapi/shot'
/* istanbul ignore next */
if (require.main === module) {
  process.env.NODE_ENV = 'production'

  const { test } = tap

  test('validate.query decorator returns 400 on bad query param', async (assert) => {
    const decor = validate.query({
      type: 'object',
      required: ['param'],
      properties: {
        param: {
          type: 'string',
          format: 'email',
        },
      },
    })(() => {
      return 'ok'
    })

    const result = await decor(<Context><unknown>{
      query: {},
    })

    assert.equal(result[STATUS], 400)
  })

  test('validate.body: invalid input', async (assert) => {
    let called = 0
    const handler = async (context: Context) => {
      ++called
      await context.body
      ++called
    }

    handler.route = 'POST /'
    handler.middleware = [
      [
        validate.body,
        {
          type: 'object',
          properties: {
            foo: { type: 'string', minLength: 1 },
            bar: { type: 'boolean' },
          },
          required: ['bar'],
        },
      ],
    ]

    const server = await runserver({
      handlers: { handler: <any>handler },
      middleware: [],
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      method: 'POST',
      url: '/',
      payload: {
        foo: '',
      },
    })

    assert.equal(response.statusCode, 400)
    assert.equal(called, 1)
    assert.same(JSON.parse(response.payload), {
      message: 'Bad request',
      errors: [
        {
          instancePath: '',
          schemaPath: '#/required',
          keyword: 'required',
          params: {
            missingProperty: 'bar',
          },
          message: "must have required property 'bar'",
        },
        {
          keyword: 'minLength',
          instancePath: '/foo',
          schemaPath: '#/properties/foo/minLength',
          params: {
            limit: 1,
          },
          message: 'must NOT have fewer than 1 characters',
        },
      ],
    })
  })

  test('validate.query: invalid input', async (assert) => {
    let called = 0
    const handler = async () => {
      ++called
    }

    handler.route = 'GET /'
    handler.middleware = [
      [
        validate.query,
        {
          type: 'object',
          properties: {
            bar: { type: 'boolean' },
          },
          required: ['bar'],
        },
      ],
    ]

    const server = await runserver({
      handlers: { handler: <any>handler },
      middleware: [],
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      url: '/',
    })
    assert.equal(response.statusCode, 400)
    assert.equal(called, 0)
    assert.same(JSON.parse(response.payload), {
      message: 'Bad request',
      errors: [
        {
          keyword: 'required',
          instancePath: '',
          schemaPath: '#/required',
          params: {
            missingProperty: 'bar',
          },
          message: "must have required property 'bar'",
        },
      ],
    })
  })

  test('validate.params: invalid input', async (assert) => {
    let called = 0
    const handler = async () => {
      ++called
    }

    handler.route = 'GET /:parm'
    handler.middleware = [
      [
        validate.params,
        {
          type: 'object',
          properties: {
            parm: { type: 'string', pattern: '^esan$' },
          },
          required: ['parm'],
        },
      ],
    ]

    const server = await runserver({
      handlers: { handler: <any>handler },
      middleware: [],
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      url: '/gouda',
    })
    assert.equal(response.statusCode, 400)
    assert.equal(called, 0)
    assert.same(JSON.parse(response.payload), {
      message: 'Bad request',
      errors: [
        {
          keyword: 'pattern',
          instancePath: '/parm',
          schemaPath: '#/properties/parm/pattern',
          params: {
            pattern: '^esan$',
          },
          message: 'must match pattern "^esan$"',
        },
      ],
    })
  })

  test('validate.query: using defaults', async (assert) => {
    const handler = async (context: Context) => {
      return context.query.bar || 'ohno'
    }

    handler.route = 'GET /'
    handler.middleware = [
      [
        validate.query,
        {
          type: 'object',
          properties: {
            bar: { type: 'string', default: 'aw heck' },
          },
        },
      ],
    ]

    const server = await runserver({
      handlers: { handler: <any>handler },
      middleware: [],
    })

    const [onrequest] = server.listeners('request')
    const response = await inject(<any>onrequest, {
      url: '/',
    })
    assert.equal(response.statusCode, 200)
    assert.same(response.payload, 'aw heck')
  })
}
/* {% endif %} */
