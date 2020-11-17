{% if esm %}
{%- set EXPORTS = "export " -%}
import { Context } from './boltzmann.js' // optionally pull in typescript definition
// {% else %}
'use strict'
{% set EXPORTS = "" -%}
const { Context } = require('./boltzmann.js') // optionally pull in typescript definition
// {%- endif %}

index.route = 'GET /'
{{ EXPORTS -}} async function index(/** @type {Context} */ context) {
  {% if oauth -%}
  const session = await context.session
  const user = session.get('user')
  const name = user ? user.name : 'Anonymous'
  {% else -%}
  const name = 'Friendly Boltzmann Author'
  {% endif %}
  {% if templates -%}
  return {
    [Symbol.for('template')]: 'index.html',
    name,
    user
  }
  {%- else -%}
  return {
    message: `welcome to boltzmann, ${name}!`,
  }
  {%- endif %}
}

greeting.route = 'GET /hello/:name'
{% if templates %}
{{ EXPORTS -}} async function greeting(/** @type {Context} */ context) {
  return {
    [Symbol.for('template')]: 'index.html',
    name: context.params.name,
  }
}
{% else %}
{{ EXPORTS -}} async function greeting(/** @type {Context} */ context) {
  return `hello ${context.params.name}`
}
{% endif %}

{%- if oauth %}
callback.route = 'GET /callback'
{{ EXPORTS -}} async function callback(/** @type {Context} */ context) {
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
  index,
  greeting,
{%- if oauth %}
  callback,
{% endif %}
}
{% endif %}
