function vary (on = []) {
  on = [].concat(on)

  return next => {
    return async context => {
      const response = await next(context)
      response[HEADERS].vary = [].concat(response[HEADERS].vary || [], on)
      return response
    }
  }
}
