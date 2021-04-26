import { Context } from './boltzmann'

import catnames from 'cat-names'
const adjectives = require('adjectives')

fancy.route = 'GET /fancy-name'
export async function fancy(_context: Context) {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const name = `${adj.charAt(0).toUpperCase() + adj.substring(1)} ${catnames.random()}`

  return name
}

plain.route = 'GET /name'
export async function plain(_context: Context) {
  return catnames.random()
}
