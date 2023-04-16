import { IPlayedCard, IPlayer } from "../../types"

export interface ITable {
  forehandIdx: number
  cards: Array<Array<IPlayedCard>>
  players: Array<IPlayer>
  nextTurn(): IPlayer
  getPlayer(idx?: number, forehandFirst?: boolean): IPlayer
  getPlayerPosition(key: string, forehandFirst?: boolean): number
  getPlayersForehandFirst(forehandIdx?: number): Array<IPlayer>
}

export function Table(players: Array<IPlayer>): ITable {
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
      return table.getPlayer()
    },
    getPlayerPosition(key, forehandFirst = false) {
      const array = forehandFirst ? table.getPlayersForehandFirst() : table.players
      return array.findIndex((p) => p.key === key)
    },
    getPlayersForehandFirst(forehand) {
      const idx = forehand !== undefined ? forehand : table.forehandIdx
      const cut = players.slice(idx, table.players.length)
      const end = players.slice(0, idx)
      return cut.concat(end)
    },
    getPlayer(idx, forehandFirst = false) {
      const array = forehandFirst ? table.getPlayersForehandFirst() : table.players
      if (idx !== undefined) {
        return array[idx]
      }
      return array[0]
    },
  }

  return table
}
