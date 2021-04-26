declare module 'culture-ships' {
  interface Ships {
    ships: string[],
    random(): string
  }

  declare const ships: Ships;
  export = ships;
}