void `{% if selftest %}`;
export const REISSUE = Symbol.for('reissue')
void `{% endif %}`;

/**{{- tsdoc(page="02-handlers.md", section="session") -}}*/
class Session extends Map<string, any> {
  // {# CD: don't use default values on computed symbol props. #}
  // {# typescript transpiles them poorly. #}
  [REISSUE]: boolean
  public dirty = false

  constructor(public id: string | null, ...args: any) {
    super(...args)
    this[REISSUE] = false
  }

  reissue() {
    this[REISSUE] = true
  }

  set(key: string, value: any) {
    const old = this.get(key)
    if (value === old) {
      return super.set(key, value)
    }
    this.dirty = true
    return super.set(key, value)
  }

  delete(key: string) {
    if (!this.has(key)) {
      return super.delete(key)
    }
    this.dirty = true
    return super.delete(key)
  }
}

void `{% if selftest %}`;
export { Session }
void `{% endif %}`;
