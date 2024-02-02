export class TMap<K, V extends { [x: string]: any }> extends Map<K, V> {
  find(finder: (value: V) => boolean): V | void {
    let result: void | V = undefined

    for (let value of this.values()) {
      const find = finder(value)
      if (!result && find) {
        result = value
      }
    }
    return result
  }

  findAll(finder: (value: V) => boolean) {
    return Array.from(this.values()).filter(finder)
  }

  patch(key: K, value: Partial<V>): V | void {
    const old = this.get(key)

    if (!old) {
      return
    }

    this.set(key, { ...old, ...value })
  }

  getOrThrow(key?: K) {
    const result = key && this.get(key)
    if (!result) {
      throw new Error(`getOrThrow(${key}) not found`)
    }
    return result
  }
}
