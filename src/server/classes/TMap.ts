export class TMap<K, V extends { [x: string]: any }> extends Map<K, V> {
  find(finder: (value: V) => boolean): V | undefined {
    let result: undefined | V = undefined

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

  getOrThrow(key: K | undefined) {
    const result = key && this.get(key)
    if (!result) {
      throw new Error(`getOrThrow(${key}) not found`)
    }
    return result
  }
}
