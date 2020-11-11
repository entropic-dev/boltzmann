{% if esm %}
{%- set EXPORTS = "export " -%}
import { Context } from './boltzmann.js' // optionally pull in typescript definition
// {% else %}
'use strict'
{% set EXPORTS = "" -%}
const { Context } = require('./boltzmann.js') // optionally pull in typescript definition
// {%- endif %}

greeting.route = 'GET /hello/:name'
{% if templates %}
{{ EXPORTS }} async function greeting(/** @type {Context} */ context) {
  return {
    [Symbol.for('template')]: 'index.html',
    name: context.params.name,
  }
}
{% else %}
{{ EXPORTS }} async function greeting(/** @type {Context} */ context) {
  return `hello ${context.params.name}`
}
{% endif %}

{%- if oauth %}
callback.route = 'GET /callback'
{{ EXPORTS }} async function callback(/** @type {Context} */ context) {
  // This handler is only called for valid oauth login attempts by the OAuth
  // middleware. context.{userKey, profile, nextUrl} are provided by the
  // aforementioned middleware. It is your application's responsibility to
  // complete logging the user in, whether that means setting a userKey in
  // session here, or merging profiles, etc. The power is YOURS!
  const session = await context.session
  session.reissue()
  session.set(context.userKey, context.profile)

  return Object.assign(Buffer.from(''), {
    [Symbol.for('status')]: 302,
    [Symbol.for('headers')]: {
      'Location': context.nextUrl
    }
  })
}
{% endif %}

{%- if not esm %}
module.exports = {
  greeting,
{%- if oauth %}
  callback,
{% endif %}
}
{% endif %}
