declare module NodeJS {
  interface Global {
    debug_export: boolean
  }
}

declare module 'honeycomb-beeline' {
}

declare module 'are-we-dev' {
  export declare function isDev(): boolean
}
