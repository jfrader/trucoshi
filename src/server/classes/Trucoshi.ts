import { IPlayInstance } from "../../lib"
import { EMatchTableState } from "../../types"
import { IMatchTable, IPublicMatchInfo } from "./MatchTable"
import { IUser } from "./User"

export interface ITrucoshi {
  users: TMap<string, IUser> // sessionId, user
  tables: MatchTableMap // sessionId, table
  turns: TMap<string, { play: IPlayInstance; resolve(): void }> // sessionId, play instance
}

interface TMap<K, V> extends Map<K, V> {
  find(finder: (value: V) => boolean): V | void
}

class TMap<K, V> extends Map<K, V> {
  find(finder: (value: V) => boolean) {
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
    let result: Array<V> = []

    for (let value of this.values()) {
      const find = finder(value)
      if (find) {
        result.push(value)
      }
    }
    return result
  }

  getOrThrow(key?: K) {
    const result = key && this.get(key)
    if (!result) {
      throw new Error(`getOrThrow(${key}) not found`)
    }
    return result
  }
}

interface MatchTableMap extends TMap<string, IMatchTable> {
  getAll(filters: { state?: Array<EMatchTableState> }): Array<IPublicMatchInfo>
}

class MatchTableMap extends TMap<string, IMatchTable> {
  getAll(filters: { state?: Array<EMatchTableState> } = {}) {
    let results: Array<IPublicMatchInfo> = []

    for (let value of this.values()) {
      if (!filters.state || !filters.state.length || filters.state.includes(value.state())) {
        results.push(value.getPublicMatchInfo())
      }
    }

    return results
  }
}

export const Trucoshi = () => {
  const users = new TMap<string, IUser>() // sessionId, user
  const tables = new MatchTableMap() // sessionId, table
  const turns = new TMap<string, { play: IPlayInstance; resolve(): void }>() // sessionId, play instance

  const trucoshi: ITrucoshi = {
    users,
    tables,
    turns,
  }

  return trucoshi
}
