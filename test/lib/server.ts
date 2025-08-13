import { io as Client, Socket } from "socket.io-client"
import { assert, expect } from "chai"
import { ESayCommand, ICard, IPublicMatch } from "../../src/types"
import { ITrucoshi, Trucoshi } from "../../src/server/classes"
import { playBotsMatch, playRandomMatch } from "../serverHelpers"
import {
  ClientToServerEvents,
  EClientEvent,
  EServerEvent,
  ServerToClientEvents,
} from "../../src/events"
import { sessionMiddleware, trucoshiMiddleware } from "../../src/server"
import * as sinon from "sinon"
import logger from "../../src/utils/logger"

describe("Socket Server", () => {
  let clients: Socket<ServerToClientEvents, ClientToServerEvents>[] = []
  let server: ITrucoshi

  const handleError = (error: unknown, message: string): Error => {
    const err = error instanceof Error ? error : new Error(message)
    throw err
  }

  before((done) => {
    server = Trucoshi({ port: Number(process.env.APP_PORT) || 9999, serverVersion: "1" })

    server.listen(
      async (io) => {
        io.use(sessionMiddleware(server))
        io.use(trucoshiMiddleware(server))

        for (let i = 0; i < 6; i++) {
          const client = Client(`http://localhost:${process.env.APP_PORT || 9999}`, {
            autoConnect: false,
            withCredentials: true,
            auth: { name: "player" + i, session: "player" + i },
          })
          clients.push(client)

          client.on("connect_error", (e) => {
            console.log("CONNECT ERROR")
            console.error(e)
          })

          client.connect()
        }

        io.on("connection", (socket) => {
          socket.setMaxListeners(250)
        })

        done()
      },
      { redis: false, lightningAccounts: false, store: false }
    )
  })

  after(() => {
    server.io.close()
    clients.forEach((c) => c.close())
  })

  beforeEach(() => {
    clients.forEach((c) => {
      c.removeAllListeners()
    })
  })

  describe("Happy paths", () => {
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
          handleError(
            null,
            `Player 0 failed to select a valid card in match ${match.matchSessionId}`
          )
        }
        callback(data)
      })

      clients[1].on(EServerEvent.WAITING_PLAY, (match, callback) => {
        match1 = match
        const data = { card: match.me?.hand.at(0) as ICard, cardIdx: 0 }
        if (!data.card || data.cardIdx === undefined) {
          handleError(
            null,
            `Player 1 failed to select a valid card in match ${match.matchSessionId}`
          )
        }
        callback(data)
      })

      await new Promise<void>((res) => {
        clients[0].emit(EClientEvent.CREATE_MATCH, ({ match }) => {
          expect(Boolean(match?.matchSessionId)).to.equal(true)
          matchId = match?.matchSessionId
          match0 = match
          res()
        })
      })

      await new Promise<void>((resolve, reject) => {
        clients[0].emit(
          EClientEvent.SET_MATCH_OPTIONS,
          matchId as string,
          { flor: false },
          ({ success, match, error }) => {
            if (success && match) {
              match0 = match
              return resolve()
            }
            reject(handleError(error, "Failed to set match options"))
          }
        )
      })

      await new Promise<void>((res) => {
        clients[1].emit(EClientEvent.JOIN_MATCH, matchId as string, 1, ({ success, match }) => {
          expect(success).to.equal(true)
          expect(match?.matchSessionId).to.equal(matchId)
          expect(Boolean(match?.players.find((player) => player.name === "player1"))).to.equal(true)
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
          match0?.matchSessionId as string,
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

    it("should play a random match of 2 players", async () => {
      await playRandomMatch(clients.slice(0, 2))
    })

    it("should play a random match of 4 players", async () => {
      await playRandomMatch(clients.slice(0, 4))
    })

    it("should play a random match of 6 players", async () => {
      await playRandomMatch(clients)
    })

    it("should play 5 matches in parallel", (done) => {
      const promises: Array<() => Promise<void>> = []
      for (let i = 0; i < 5; i++) {
        promises.push(() => playRandomMatch(clients))
      }

      Promise.all(promises.map((p) => p()))
        .then(() => done())
        .catch((e) => {
          done(e)
        })
    })

    it("should play 5 matches in series", async () => {
      for (let i = 0; i < 5; i++) {
        await playRandomMatch(clients)
      }
    })

    it("should play a match between 1 abandoning player and 1 bot", (done) => {
      playBotsMatch([clients[0]], 1)
        .then(() => done())
        .catch((e) => {
          done(e)
        })
    })

    it("should play 100 matches between 1 abandoning player and 3 bots", (done) => {
      const promises: Array<() => Promise<void>> = []
      for (let i = 0; i < 100; i++) {
        promises.push(() => playBotsMatch([clients[0]], 3))
      }

      Promise.all(promises.map((p) => p()))
        .then(() => done())
        .catch((e) => {
          done(e)
        })
    })

    it("should play 100 matches between 1 abandoning player and 5 bots", (done) => {
      const promises: Array<() => Promise<void>> = []
      for (let i = 0; i < 100; i++) {
        promises.push(() => playBotsMatch([clients[0]], 5))
      }

      Promise.all(promises.map((p) => p()))
        .then(() => done())
        .catch((e) => {
          done(e)
        })
    })
  })

  describe("Invalid paths", () => {
    let warnStub: sinon.SinonStub
    let errorStub: sinon.SinonStub
    let childStub: sinon.SinonStub

    const childLogger = {
      warn: sinon.stub().callsFake(() => {}),
      error: sinon.stub().callsFake(() => {}),
      info: sinon.stub().callsFake(() => {}),
      debug: sinon.stub().callsFake(() => {}),
      trace: sinon.stub().callsFake(() => {}),
    }

    before(() => {
      warnStub = sinon.stub(logger, "warn").callsFake(() => {})
      errorStub = sinon.stub(logger, "error").callsFake(() => {})
      childStub = sinon.stub(logger, "child").callsFake((bindings) => {
        return childLogger
      })
    })

    after(() => {
      sinon.restore()
    })

    it("should handle invalid cards gracefully", async () => {
      let matchId: string | undefined
      let match0: IPublicMatch | undefined
      let match1: IPublicMatch | undefined
      let playedInvalid = false

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

        if (!playedInvalid) {
          playedInvalid = true
          callback({ card: "xx" as any, cardIdx: 999 })
          return
        }

        const data = { card: match.me?.hand.at(0) as ICard, cardIdx: 0 }
        if (!data.card || data.cardIdx === undefined) {
          handleError(
            null,
            `Player 0 failed to select a valid card in match ${match.matchSessionId}`
          )
        }
        callback(data)
      })

      clients[1].on(EServerEvent.WAITING_PLAY, (match, callback) => {
        match1 = match
        const data = { card: match.me?.hand.at(0) as ICard, cardIdx: 0 }
        if (!data.card || data.cardIdx === undefined) {
          handleError(
            null,
            `Player 1 failed to select a valid card in match ${match.matchSessionId}`
          )
        }
        callback(data)
      })

      await new Promise<void>((res) => {
        clients[0].emit(EClientEvent.CREATE_MATCH, ({ match }) => {
          expect(Boolean(match?.matchSessionId)).to.equal(true)
          matchId = match?.matchSessionId
          match0 = match
          res()
        })
      })

      await new Promise<void>((resolve, reject) => {
        clients[0].emit(
          EClientEvent.SET_MATCH_OPTIONS,
          matchId as string,
          { flor: false },
          ({ success, match, error }) => {
            if (success && match) {
              match0 = match
              return resolve()
            }
            reject(handleError(error, "Failed to set match options"))
          }
        )
      })

      await new Promise<void>((res) => {
        clients[1].emit(EClientEvent.JOIN_MATCH, matchId as string, 1, ({ success, match }) => {
          expect(success).to.equal(true)
          expect(match?.matchSessionId).to.equal(matchId)
          expect(Boolean(match?.players.find((player) => player.name === "player1"))).to.equal(true)
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
          match0?.matchSessionId as string,
          ({ success, matchSessionId }) => {
            expect(success).to.equal(true)
            expect(matchSessionId).to.equal(matchId)
            res()
          }
        )
      })

      await WinnerPromise

      expect(childLogger.warn.called).to.be.true
      expect(childLogger.error.called).to.be.true
      expect(match0?.winner?.points.buenas).to.be.greaterThanOrEqual(9)
    })

    it("should handle invalid commands gracefully", async () => {
      let matchId: string | undefined
      let match0: IPublicMatch | undefined
      let match1: IPublicMatch | undefined
      let playedInvalid = false
      let playedValid = false

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

      clients[0].on(EServerEvent.WAITING_POSSIBLE_SAY, (match, callback) => {
        match0 = match

        if (!match.me?.isTurn) {
          return
        }

        if (!playedInvalid) {
          callback({ command: 999 })
          playedInvalid = true
          return
        }

        if (!playedValid) {
          callback({ command: ESayCommand.MAZO })
          playedValid = true
        }
      })

      clients[0].on(EServerEvent.WAITING_PLAY, (match, callback) => {
        match0 = match

        if (!playedInvalid || !playedValid) {
          return
        }

        const data = { card: match.me?.hand.at(0) as ICard, cardIdx: 0 }
        if (!data.card || data.cardIdx === undefined) {
          handleError(
            null,
            `Player 0 failed to select a valid card in match ${match.matchSessionId}`
          )
        }
        callback(data)
      })

      clients[1].on(EServerEvent.WAITING_PLAY, (match, callback) => {
        match1 = match
        const data = { card: match.me?.hand.at(0) as ICard, cardIdx: 0 }
        if (!data.card || data.cardIdx === undefined) {
          handleError(
            null,
            `Player 1 failed to select a valid card in match ${match.matchSessionId}`
          )
        }
        callback(data)
      })

      await new Promise<void>((res) => {
        clients[0].emit(EClientEvent.CREATE_MATCH, ({ match }) => {
          expect(Boolean(match?.matchSessionId)).to.equal(true)
          matchId = match?.matchSessionId
          match0 = match
          res()
        })
      })

      await new Promise<void>((resolve, reject) => {
        clients[0].emit(
          EClientEvent.SET_MATCH_OPTIONS,
          matchId as string,
          { flor: false },
          ({ success, match, error }) => {
            if (success && match) {
              match0 = match
              return resolve()
            }
            reject(handleError(error, "Failed to set match options"))
          }
        )
      })

      await new Promise<void>((res) => {
        clients[1].emit(EClientEvent.JOIN_MATCH, matchId as string, 1, ({ success, match }) => {
          expect(success).to.equal(true)
          expect(match?.matchSessionId).to.equal(matchId)
          expect(Boolean(match?.players.find((player) => player.name === "player1"))).to.equal(true)
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
          match0?.matchSessionId as string,
          ({ success, matchSessionId }) => {
            if (!success) {
              handleError(null, `Failed to start match ${match0?.matchSessionId}`)
            }
            expect(success).to.equal(true)
            expect(matchSessionId).to.equal(matchId)
            res()
          }
        )
      })

      await WinnerPromise

      expect(childLogger.warn.called).to.be.true
      expect(childLogger.error.called).to.be.true
      expect(match0?.winner?.points.buenas).to.be.greaterThanOrEqual(9)
    })
  })
})
