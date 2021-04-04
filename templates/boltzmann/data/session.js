class Session extends Map {
  constructor(id, ...args) {
    super(...args)
    this.dirty = false
    this.id = id
  }

  reissue() {
    this[REISSUE] = true
  }

  set(key, value) {
    const old = this.get(key)
    if (value === old) {
      return super.set(key, value)
    }
    this.dirty = true
    return super.set(key, value)
  }

  delete(key) {
    if (!this.has(key)) {
      return super.delete(key)
    }
    this.dirty = true
    return super.delete(key)
  }
}
