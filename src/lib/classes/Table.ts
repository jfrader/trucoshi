import { ITable, ITeam } from "../types"

export function Table(teams: Array<ITeam>, size: number): ITable {
  const table: ITable = {
    players: [],
    cards: [],
    forehandIdx: 0,
    nextTurn() {
      if (table.forehandIdx < size * 2 - 1) {
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

  if (teams[0].players.length != size || teams[1].players.length != size) {
    throw new Error("Unexpected team size")
  }

  for (let i = 0; i < size; i++) {
    table.players.push(teams[0].players[i])
    table.players.push(teams[1].players[i])
  }

  return table
}
