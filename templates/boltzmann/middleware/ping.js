function handlePing () {
  return next => context => {
    if (context.url.pathname === '/monitor/ping') {
      return ship
    }
    return next(context)
  }
}
