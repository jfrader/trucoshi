import { IPlayer } from "../../types"

export interface ITable<TPlayer extends { key: string } = IPlayer> {
  sessionId: string
  forehandIdx: number
  players: Array<TPlayer>
  nextHand(): TPlayer
  getPlayerByPosition(idx?: number, forehandFirst?: boolean): TPlayer
  getPlayerPosition(key: string, forehandFirst?: boolean): number
  getPlayersForehandFirst(forehandIdx?: number): Array<TPlayer>
}

export function Table<TPlayer extends { key: string } = IPlayer>(sessionId: string, players: Array<TPlayer>) {
  const table: ITable<TPlayer> = {
    sessionId,
    players,
    forehandIdx: 0,
    nextHand() {
      if (table.forehandIdx < table.players.length - 1) {
        table.forehandIdx++
      } else {
        table.forehandIdx = 0
      }
      const nextPlayer = table.getPlayerByPosition()
      return nextPlayer
    },
    getPlayerPosition(key, forehandFirst = false) {
      const array = forehandFirst ? table.getPlayersForehandFirst() : table.players
      const position = array.findIndex((p) => p.key === key)
      return position
    },
    getPlayersForehandFirst(forehand) {
      const idx = forehand !== undefined ? forehand : table.forehandIdx
      const cut = players.slice(idx, table.players.length)
      const end = players.slice(0, idx)
      const result = cut.concat(end)
      return result
    },
    getPlayerByPosition(idx, forehandFirst = false) {
      const array = forehandFirst ? table.getPlayersForehandFirst() : table.players
      const player = idx !== undefined ? array[idx] : array[0]
      return player
    },
  }

  return table
}
