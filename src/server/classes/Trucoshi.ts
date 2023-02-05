import { IPlayInstance } from "../../lib"
import { EMatchTableState, IPublicMatchInfo, TMap } from "../../types"
import { IMatchTable } from "./MatchTable"
import { IUser } from "./User"

export interface ITrucoshi {
  users: TMap<string, IUser> // sessionId, user
  tables: MatchTableMap // sessionId, table
  turns: TMap<string, ITrucoshiTurn> // sessionId, play instance
}

interface ITrucoshiTurn {
  type: "play" | "truco"
  play: IPlayInstance
  resolve(): void
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
  const turns = new TMap<string, ITrucoshiTurn>() // sessionId, play instance, play promise resolve and type

  const trucoshi: ITrucoshi = {
    users,
    tables,
    turns,
  }

  return trucoshi
}
