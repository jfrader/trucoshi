import { IPlayedCard, IPlayer } from "../../types"

export interface ITable<TPlayer extends { key: string } = IPlayer> {
  forehandIdx: number
  cards: Array<Array<IPlayedCard>>
  players: Array<TPlayer>
  nextHand(): TPlayer
  getPlayerByPosition(idx?: number, forehandFirst?: boolean): TPlayer
  getPlayerPosition(key: string, forehandFirst?: boolean): number
  getPlayersForehandFirst(forehandIdx?: number): Array<TPlayer>
}

export function Table<TPlayer extends { key: string } = IPlayer>(players: Array<TPlayer>) {
  const table: ITable<TPlayer> = {
    players,
    cards: [],
    forehandIdx: 0,
    nextHand() {
      if (table.forehandIdx < table.players.length - 1) {
        table.forehandIdx++
      } else {
        table.forehandIdx = 0
      }
      return table.getPlayerByPosition()
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
    getPlayerByPosition(idx, forehandFirst = false) {
      const array = forehandFirst ? table.getPlayersForehandFirst() : table.players
      if (idx !== undefined) {
        return array[idx]
      }
      return array[0]
    },
  }

  return table
}
