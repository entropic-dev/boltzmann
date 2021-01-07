import { Context, Response } from './boltzmann.js'

import catnames from 'cat-names'
const adjectives = require('adjectives')

fancy.route = 'GET /fancy-name'
export async function fancy(_context: Context): Promise<Response> {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const name = `${adj.charAt(0).toUpperCase() + adj.substring(1)} ${catnames.random()}`

  return name
}

plain.route = 'GET /name'
export async function plain(_context: Context): Promise<Response> {
  return catnames.random()
}
