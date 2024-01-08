import { io as Client, Socket } from "socket.io-client"
import { assert, expect } from "chai"
import { trucoshi } from "../src/server/middlewares/trucoshi"
import {
  ClientToServerEvents,
  EAnswerCommand,
  EClientEvent,
  ECommand,
  EEnvidoAnswerCommand,
  ESayCommand,
  EServerEvent,
  ICard,
  IPublicMatch,
  ServerToClientEvents,
} from "../src/types"
import { ITrucoshi, Trucoshi, TrucoshiSocket } from "../src/server/classes"
import { session } from "../src/server"
import logger from "../src/utils/logger"

describe("Socket Server", () => {
  let serverSocket: TrucoshiSocket

  let clients: Socket<ServerToClientEvents, ClientToServerEvents>[] = []

  let server: ITrucoshi

  before((done) => {
    server = Trucoshi({ port: 9999, serverVersion: "1" })

    server.listen(
      (io) => {
        io.use(session(server))
        io.use(trucoshi(server))

        for (let i = 0; i < 6; i++) {
          clients.push(
            Client(`http://localhost:9999`, {
              autoConnect: false,
              withCredentials: true,
              auth: { name: "player" + i },
            })
          )
        }

        io.on("connection", (socket) => {
          serverSocket = socket
        })

        const promises = clients.map(
          (c) =>
            new Promise<void>((res) => {
              c.on(EServerEvent.SET_SESSION, ({ session, name }) => {
                if ((c.auth as any).sessionID !== session) {
                  c.auth = { name, sessionID: session }
                }
                res()
              })
              c.connect()
            })
        )

        Promise.all(promises).then(() => done())
      },
      { redis: false, lightningAccounts: false }
    )
  })

  after(() => {
    server.io.close()
    clients.forEach((c) => c.close())
  })

  it("should send ping", (done) => {
    clients[0].on(EServerEvent.PONG, (_a, b) => {
      assert.equal(b, 123)
      done()
    })
    clients[0].emit(EClientEvent.PING, 123)
  })

  it("should play an entire match", async () => {
    let matchId: string | undefined
    let match0: IPublicMatch | undefined
    let match1: IPublicMatch | undefined

    let winningResolve = () => {}
    const WinnerPromise = new Promise<void>((res) => {
      winningResolve = res
    })

    clients[0].on(EServerEvent.UPDATE_MATCH, (match) => {
      match0 = match
    })

    clients[1].on(EServerEvent.UPDATE_MATCH, (match) => {
      match1 = match
      if (match.winner) {
        winningResolve()
      }
    })

    clients[0].on(EServerEvent.WAITING_PLAY, (match, callback) => {
      match0 = match
      const data = { card: match.me?.hand.at(0) as ICard, cardIdx: 0 }
      if (!data.card || data.cardIdx === undefined) {
        console.error("WTF")
        console.log(data)
        process.exit(1)
      }
      callback(data)
    })

    clients[1].on(EServerEvent.WAITING_PLAY, (match, callback) => {
      match1 = match
      const data = { card: match.me?.hand.at(0) as ICard, cardIdx: 0 }
      if (!data.card || data.cardIdx === undefined) {
        console.error("WTF")
        console.log(data)
        process.exit(1)
      }
      callback(data)
    })

    clients[0].on(EServerEvent.PREVIOUS_HAND, (match, callback) => {
      expect(match.matchSessionId === matchId)
      callback()
    })

    clients[1].on(EServerEvent.PREVIOUS_HAND, (match, callback) => {
      expect(match.matchSessionId === matchId)
      callback()
    })

    await new Promise<void>((res) => {
      clients[0].emit(EClientEvent.CREATE_MATCH, ({ match }) => {
        expect(Boolean(match?.matchSessionId)).to.equal(true)
        matchId = match?.matchSessionId
        match0 = match
        res()
      })
    })

    await new Promise<void>((res) => {
      clients[1].emit(EClientEvent.JOIN_MATCH, matchId as string, 1, ({ success, match }) => {
        expect(success).to.equal(true)
        expect(match?.matchSessionId).to.equal(matchId)
        expect(Boolean(match?.players.find((player) => player.id === "player1"))).to.equal(true)
        match1 = match
        res()
      })
    })

    const setReady = [
      new Promise<void>((res) => {
        clients[0].emit(EClientEvent.SET_PLAYER_READY, matchId as string, true, ({ success }) => {
          expect(success).to.equal(true)
          res()
        })
      }),
      new Promise<void>((res) => {
        clients[1].emit(EClientEvent.SET_PLAYER_READY, matchId as string, true, ({ success }) => {
          expect(success).to.equal(true)
          res()
        })
      }),
    ]
    await Promise.all(setReady)

    await new Promise<void>((res) => {
      clients[0].emit(
        EClientEvent.START_MATCH,
        matchId as string,
        ({ success, matchSessionId }) => {
          expect(success).to.equal(true)
          expect(matchSessionId).to.equal(matchId)
          res()
        }
      )
    })

    await WinnerPromise

    expect(match0?.winner?.points.buenas).to.be.greaterThanOrEqual(9)
  })

  it("should play a random match of 6", async () => {
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
          (Math.random() > 0.8 || match.me?.commands?.includes(EAnswerCommand.QUIERO)) &&
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
      clients[0].emit(
        EClientEvent.START_MATCH,
        matchId as string,
        ({ success, matchSessionId }) => {
          expect(success).to.equal(true)
          expect(matchSessionId).to.equal(matchId)
          res()
        }
      )
    })

    await WinnerPromise

    expect(matches[0]?.winner?.points.buenas).to.be.greaterThanOrEqual(9)
  })

  /**
   * RANDOM MATCH OF 4 ------------------------------------------------------------------------
   */
  it("should play a random match of 4", async () => {
    let matchId: string | undefined
    let matches: IPublicMatch[] = []
    const fourClients = clients.slice(0, 4)

    let winningResolve = () => {}
    const WinnerPromise = new Promise<void>((res) => {
      winningResolve = res
    })

    fourClients.forEach((c, i) => {
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
          (Math.random() > 0.8 || match.me?.commands?.includes(EAnswerCommand.QUIERO)) &&
          match.me?.commands?.length
        ) {
          const rndIdx = Math.floor(Math.random() * match.me.commands.length)
          const command = match.me.commands[rndIdx] as ECommand

          return callback({ command })
        }
      })
    })

    fourClients.forEach((c, i) =>
      c.on(EServerEvent.PREVIOUS_HAND, (match, callback) => {
        expect(match.matchSessionId === matchId)
        callback()
      })
    )

    await new Promise<void>((res, rej) => {
      fourClients[0].emit(EClientEvent.CREATE_MATCH, ({ match }) => {
        expect(Boolean(match?.matchSessionId)).to.equal(true)
        matchId = match?.matchSessionId
        if (!match) {
          return rej("Match not found create match")
        }
        matches[0] = match
        res()
      })
    })

    const joinPromises = fourClients.map((c, i) => {
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

    fourClients.forEach((c, i) =>
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
      fourClients[0].emit(
        EClientEvent.START_MATCH,
        matchId as string,
        ({ success, matchSessionId }) => {
          expect(success).to.equal(true)
          expect(matchSessionId).to.equal(matchId)
          res()
        }
      )
    })

    await WinnerPromise

    expect(matches[0]?.winner?.points.buenas).to.be.greaterThanOrEqual(9)
  })
})
