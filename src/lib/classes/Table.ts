import { GAME_ERROR, TEAM_SIZE_VALUES } from "../constants"
import { IPlayer, ITable, ITeam } from "../types"
import { Match } from "./Match"
import { Player } from "./Player"
import { Team } from "./Team"

export function Table(players: Array<IPlayer>, teams: Array<ITeam>): ITable {
  const table: ITable = {
    players,
    cards: [],
    forehandIdx: 0,
    nextTurn() {
      if (table.forehandIdx < table.players.length - 1) {
        table.forehandIdx++
      } else {
        table.forehandIdx = 0
      }
      return table.player()
    },
    getPlayerPosition(id) {
      return table.players.findIndex((p) => p.id === id)
    },
    player(idx) {
      if (idx !== undefined) {
        return table.players[idx]
      }
      return table.players[table.forehandIdx]
    },
  }

  return table
}
