import { expect } from "chai"
import {
  ClientToServerEvents,
  EAnswerCommand,
  EClientEvent,
  ECommand,
  EEnvidoAnswerCommand,
  EServerEvent,
  ICard,
  IPublicMatch,
  ServerToClientEvents,
} from "../src/types"
import { Socket } from "socket.io-client"

export const playRandomMatch = async (
  clients: Socket<ServerToClientEvents, ClientToServerEvents>[]
) => {
  let matchId: string | undefined
  let matches: IPublicMatch[] = []

  let winningResolve = () => {}
  const WinnerPromise = new Promise<void>((res) => {
    winningResolve = res
  })

  clients.forEach((c, i) => {
    c.on(EServerEvent.WAITING_PLAY, (match, callback) => {
      matches[i] = match

      if (!match.me?.hand) {
        console.error("WTF")
        process.exit(1)
      }

      const rndIdx = Math.floor(Math.random() * match.me.hand.length)

      const data = { card: match.me.hand[rndIdx] as ICard, cardIdx: rndIdx }

      callback(data)
    })

    c.on(EServerEvent.WAITING_POSSIBLE_SAY, (match, callback) => {
      matches[i] = match

      if (match.me?.isEnvidoTurn && match.me.envido) {
        if (!match.me?.isTurn) {
          return
        }

        if (match.me.commands.includes(EEnvidoAnswerCommand.SON_BUENAS) && Math.random() > 0.52) {
          return callback({ command: EEnvidoAnswerCommand.SON_BUENAS })
        }

        const rndIdx = Math.floor(Math.random() * match.me.envido.length)
        const command = match.me.envido[rndIdx] as number

        return callback({ command })
      }

      if (
        (Math.random() > 0.49 || match.me?.commands?.includes(EAnswerCommand.QUIERO)) &&
        match.me?.commands?.length
      ) {
        const rndIdx = Math.floor(Math.random() * match.me.commands.length)
        const command = match.me.commands[rndIdx] as ECommand

        return callback({ command })
      }
    })
  })

  clients.forEach((c, i) =>
    c.on(EServerEvent.PREVIOUS_HAND, (match, callback) => {
      expect(match.matchSessionId === matchId)
      callback()
    })
  )

  await new Promise<void>((res, rej) => {
    clients[0].emit(EClientEvent.CREATE_MATCH, ({ match }) => {
      expect(Boolean(match?.matchSessionId)).to.equal(true)
      matchId = match?.matchSessionId
      if (!match) {
        return rej("Match not found create match")
      }
      matches[0] = match
      res()
    })
  })

  const joinPromises = clients.map((c, i) => {
    const sendReady = (matchId: any) =>
      new Promise<void>((res, rej) =>
        c.emit(EClientEvent.SET_PLAYER_READY, matchId, true, ({ success, match }) => {
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
          expect(success).to.equal(true)
          expect(match?.matchSessionId).to.equal(matchId)

          expect(Boolean(match?.players.find((player) => player.id === "player" + i))).to.equal(
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
    await new Promise((res) => setTimeout(res, 50))
    tidx = Number(!tidx) as 0 | 1
  }

  clients.forEach((c, i) =>
    c.on(EServerEvent.UPDATE_MATCH, (match) => {
      matches[i] = match
      if (i === 0) {
        if (match.winner) {
          winningResolve()
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
