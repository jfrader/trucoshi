import { IPlayedCard, IPlayer } from "../../types"
import logger from "../../utils/logger"

export interface ITable<TPlayer extends { key: string } = IPlayer> {
  forehandIdx: number
  cards: Array<Array<IPlayedCard>>
  players: Array<TPlayer>
  nextHand(): TPlayer
  getPlayerByPosition(idx?: number, forehandFirst?: boolean): TPlayer
  getPlayerPosition(key: string, forehandFirst?: boolean): number
  getPlayersForehandFirst(forehandIdx?: number): Array<TPlayer>
}

const log = logger.child({ class: "Table" })

export function Table<TPlayer extends { key: string } = IPlayer>(players: Array<TPlayer>) {
  log.trace({ playerKeys: players.map((p) => p.key) }, "Creating new table")

  const table: ITable<TPlayer> = {
    players,
    cards: [],
    forehandIdx: 0,
    nextHand() {
      log.trace({ currentForehandIdx: table.forehandIdx }, "nextHand called")
      if (table.forehandIdx < table.players.length - 1) {
        table.forehandIdx++
      } else {
        table.forehandIdx = 0
      }
      log.trace({ newForehandIdx: table.forehandIdx }, "nextHand updated")
      const nextPlayer = table.getPlayerByPosition()
      log.trace({ playerKey: nextPlayer.key }, "nextHand returning player")
      return nextPlayer
    },
    getPlayerPosition(key, forehandFirst = false) {
      log.trace({ key, forehandFirst }, "getPlayerPosition called")
      const array = forehandFirst ? table.getPlayersForehandFirst() : table.players
      const position = array.findIndex((p) => p.key === key)
      log.trace({ key, position }, "getPlayerPosition result")
      return position
    },
    getPlayersForehandFirst(forehand) {
      const idx = forehand !== undefined ? forehand : table.forehandIdx
      log.trace({ forehandIdx: idx }, "getPlayersForehandFirst called")
      const cut = players.slice(idx, table.players.length)
      const end = players.slice(0, idx)
      const result = cut.concat(end)
      log.trace({ playerKeys: result.map((p) => p.key) }, "getPlayersForehandFirst result")
      return result
    },
    getPlayerByPosition(idx, forehandFirst = false) {
      log.trace({ idx, forehandFirst }, "getPlayerByPosition called")
      const array = forehandFirst ? table.getPlayersForehandFirst() : table.players
      const player = idx !== undefined ? array[idx] : array[0]
      log.trace({ playerKey: player.key }, "getPlayerByPosition result")
      return player
    },
  }

  log.trace({ forehandIdx: table.forehandIdx }, "Table initialization complete")
  return table
}
