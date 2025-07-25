import { expect } from "chai"
import { ICard, IPublicMatch } from "../../src/types"
import { Socket } from "socket.io-client"
import logger from "../../src/utils/logger"
import {
  ClientToServerEvents,
  EClientEvent,
  EServerEvent,
  ServerToClientEvents,
} from "../../src/events"
import { EMatchState } from "@prisma/client"

export const playRandomMatch = async (
  clients: Socket<ServerToClientEvents, ClientToServerEvents>[]
) => {
  let matchId: string | undefined
  let matches: IPublicMatch[] = []

  let winningResolve = () => {}
  const WinnerPromise = new Promise<void>((res) => {
    winningResolve = res
  })

  const checkMatch = (i, match) => {
    if (matches[i] && match?.matchSessionId !== matches[i].matchSessionId) {
      return false
    }

    return true
  }

  clients.forEach((c, i) => {
    c.on(EServerEvent.WAITING_PLAY, (match, callback) => {
      if (!checkMatch(i, match)) {
        return
      }
      matches[i] = match

      if (!match.me?.hand) {
        console.error("WTF")
        process.exit(1)
      }

      const rndIdx = Math.floor(Math.random() * match.me.hand.length)

      const data = { card: match.me.hand[rndIdx] as ICard, cardIdx: rndIdx }

      callback(data)
    })
  })

  await new Promise<void>((res, rej) => {
    clients[0].emit(EClientEvent.CREATE_MATCH, ({ match }) => {
      if (!checkMatch(0, match)) {
        return
      }
      expect(Boolean(match?.matchSessionId)).to.equal(true)
      matchId = match?.matchSessionId
      if (!match) {
        return rej("Match not found create match")
      }
      matches[0] = match
      res()
    })
  })

  await new Promise<void>((resolve, reject) => {
    clients[0].emit(
      EClientEvent.SET_MATCH_OPTIONS,
      matchId as string,
      { flor: false },
      ({ success }) => {
        if (success) {
          return resolve()
        }
        reject(new Error("Failed to set match bet"))
      }
    )
  })

  const joinPromises = clients.map((c, i) => {
    const sendReady = (matchId: any) =>
      new Promise<void>((res, rej) =>
        c.emit(EClientEvent.SET_PLAYER_READY, matchId, true, ({ success, match }) => {
          if (!checkMatch(i, match)) {
            return
          }
          if (!match) {
            return rej("Match not found ready")
          }
          matches[i] = match
          expect(success).to.equal(true)
          res()
        })
      )

    if (i === 0) {
      return () => sendReady(matchId)
    }
    return (teamIdx: 0 | 1) =>
      new Promise<void>((res, rej) => {
        c.emit(EClientEvent.JOIN_MATCH, matchId as string, teamIdx, ({ success, match }) => {
          if (!checkMatch(i, match)) {
            return
          }
          expect(success).to.equal(true)
          expect(match?.matchSessionId).to.equal(matchId)

          expect(Boolean(match?.players.find((player) => player.name === "player" + i))).to.equal(
            true
          )

          if (!match) {
            return rej("Match not found join match")
          }
          matches[i] = match

          sendReady(matchId).then(res)
        })
      })
  })

  let tidx: 0 | 1 = 0
  for (const joinPromise of joinPromises) {
    await joinPromise(tidx)
    tidx = Number(!tidx) as 0 | 1
  }

  clients.forEach((c, i) =>
    c.on(EServerEvent.UPDATE_MATCH, (match) => {
      if (!checkMatch(i, match)) {
        return
      }
      matches[i] = match
      if (i === 0) {
        if (match.winner) {
          winningResolve()
        } else {
          if (match.state === EMatchState.FINISHED) {
            logger.fatal(new Error("FATALITY"), "WTF")
            process.exit(1)
          }
        }
      }
    })
  )

  await new Promise<void>((res) => {
    clients[0].emit(EClientEvent.START_MATCH, matchId as string, ({ success, matchSessionId }) => {
      expect(success).to.equal(true)
      expect(matchSessionId).to.equal(matchId)
      res()
    })
  })

  await WinnerPromise

  expect(matches[0]?.winner?.points.buenas).to.be.greaterThanOrEqual(9)
}
