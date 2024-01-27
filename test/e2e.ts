import { io as Client, Socket } from "socket.io-client"
import { assert, expect } from "chai"
import { trucoshi } from "../src/server/middlewares/trucoshi"
import {
  EAnswerCommand,
  ECommand,
  EEnvidoAnswerCommand,
  ICard,
  IPublicMatch,
  IPublicPlayer,
} from "../src/types"
import { ITrucoshi, Trucoshi, TrucoshiSocket } from "../src/server/classes"
import { session } from "../src/server"
import logger from "../src/utils/logger"
import { Api } from "lightning-accounts"
import { ClientToServerEvents, EClientEvent, EServerEvent, ServerToClientEvents } from "../src/events"
import { EMatchState } from "@prisma/client"

describe("E2E", () => {
  let serverSocket: TrucoshiSocket
  let clients: Socket<ServerToClientEvents, ClientToServerEvents>[] = []
  let server: ITrucoshi
  let identities: string[] = []
  let apis: Api<unknown>[] = []
  let cookies: string[][] = []
  let balances: number[] = []

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
              auth: { name: "Player " + i },
            })
          )
        }

        io.on("connection", (socket) => {
          serverSocket = socket
          socket.setMaxListeners(50)
        })

        const promises = () =>
          clients.map(
            (c, i) =>
              new Promise<void>((resolve) => {
                c.on(EServerEvent.SET_SESSION, ({ session, name }) => {
                  if ((c.auth as any).sessionID !== session) {
                    c.auth = { name, sessionID: session }
                  }

                  const api = new Api({
                    baseURL: process.env.NODE_LIGHTNING_ACCOUNTS_URL,
                    withCredentials: true,
                  })

                  apis.push(api)

                  api.auth
                    .loginCreate({
                      email: i + "_e2e_player@trucoshi.com",
                      password: "secret",
                    })
                    .then((res) => {
                      cookies[i] = res.headers["set-cookie"] || []

                      const identityJwt = (res.headers["set-cookie"] as string[])
                        .find((cookie) => cookie.includes("jwt:identity"))
                        ?.match(new RegExp(`^${"jwt:identity"}=(.+?);`))?.[1]

                      if (identityJwt && res.data.user) {
                        identities[i] = identityJwt
                        return c.emit(
                          EClientEvent.LOGIN,
                          res.data.user,
                          identityJwt,
                          ({ success }) => {
                            if (success) {
                              return resolve()
                            }
                            console.error(new Error("Failed to login"))
                            process.exit(1)
                          }
                        )
                      }
                      console.error(new Error("Failed to get identity jwt from lightning accounts"))
                      process.exit(1)
                    })
                    .catch((e) => {
                      console.error(e)
                      process.exit(1)
                    })
                })
                c.connect()
              })
          )

        Promise.all(promises()).then(() => done())
      },
      { redis: false, lightningAccounts: true, store: true }
    )
  })

  after(() => {
    server.io.close()
    clients.forEach((c) => c.close())
  })

  beforeEach((done) => {
    clients.map((c) => c.removeAllListeners())

    const balancePromises = () =>
      clients.map(
        (c, i) =>
          new Promise<void>((resolve) => {
            apis[i].auth
              .getAuth({ headers: { Cookie: cookies[i] } })
              .then((res) => {
                balances[i] = res.data.wallet?.balanceInSats || 0
                resolve()
              })
              .catch((e) => {
                logger.error(e)
                process.exit(1)
              })
          })
      )

    Promise.all(balancePromises()).then(() => done())
  })

  it("should send ping", (done) => {
    clients[0].on(EServerEvent.PONG, (_a, b) => {
      assert.equal(b, 1234)
      done()
    })
    clients[0].emit(EClientEvent.PING, 1234)
  })

  it("should bet, play and award winners", async () => {
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

      c.on(EServerEvent.WAITING_POSSIBLE_SAY, (match, callback) => {
        if (!checkMatch(i, match)) {
          return
        }
        matches[i] = match

        if (match.me?.isEnvidoTurn && match.me.envido) {
          if (!match.me?.isTurn) {
            return
          }

          if (match.me.commands.includes(EEnvidoAnswerCommand.SON_BUENAS) && Math.random() > 0.55) {
            return callback({ command: EEnvidoAnswerCommand.SON_BUENAS })
          }

          const rndIdx = Math.floor(Math.random() * match.me.envido.length)
          const command = match.me.envido[rndIdx] as number

          return callback({ command })
        }

        if (
          (Math.random() > 0.88 || match.me?.commands?.includes(EAnswerCommand.QUIERO)) &&
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
        if (!checkMatch(i, match)) {
          return
        }
        expect(match.matchSessionId === matchId)
        callback()
      })
    )

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
        identities[0],
        matches[0].matchSessionId,
        { satsPerPlayer: 10 },
        ({ success, match }) => {
          if (success && match) {
            matches[0] = match
            return resolve()
          }
          reject(new Error("Failed to set match bet"))
        }
      )
    })

    for (const [idx, client] of clients.entries()) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10))
    }

    const joinPromises = clients.map((c, i) => {
      const sendReady = (matchId: any, j: number, me?: IPublicPlayer | null) => {
        return new Promise<void>((resolve, reject) => {
          const prid = matches[j].me?.payRequestId
          if (!prid) {
            logger.error({ ...matches[j].me, wtf: true })
            return reject(new Error("Pay request not found!"))
          }

          apis[j].wallet
            .payRequest(String(prid), { headers: { Cookie: cookies[i] } })
            .then(() => {
              c.emit(EClientEvent.SET_PLAYER_READY, matchId, true, ({ success, match }) => {
                if (!checkMatch(i, match)) {
                  return
                }
                if (!match) {
                  return reject("Match not found ready")
                }
                matches[i] = match
                expect(success).to.equal(true)
                resolve()
              })
            })
            .catch((e) => {
              logger.fatal(e)
              process.exit(1)
            })
        })
      }

      if (i === 0) {
        return () => sendReady(matchId, 0)
      }
      return (teamIdx: 0 | 1) =>
        new Promise<void>((res, rej) => {
          c.emit(EClientEvent.JOIN_MATCH, matchId as string, teamIdx, ({ success, match }) => {
            if (!checkMatch(i, match)) {
              return
            }
            expect(success).to.equal(true)
            expect(match?.matchSessionId).to.equal(matchId)

            if (!match) {
              return rej("Match not found join match")
            }
            matches[i] = match

            sendReady(matchId, i).then(res)
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
      clients[0].emit(
        EClientEvent.START_MATCH,
        identities[0],
        matchId as string,
        ({ success, matchSessionId }) => {
          expect(success).to.equal(true)
          expect(matchSessionId).to.equal(matchId)
          res()
        }
      )
    })

    await WinnerPromise

    const winner = matches[0]?.winner

    expect(winner?.points.buenas).to.be.greaterThanOrEqual(9)

    for (const [idx] of clients.entries()) {
      const res = await apis[idx].auth.getAuth({ headers: { Cookie: cookies[idx] } })

      if (winner?.id === matches[idx].me?.teamIdx) {
        expect(res.data.wallet?.balanceInSats).to.equal(balances[idx] + 9)
      } else {
        expect(res.data.wallet?.balanceInSats).to.equal(balances[idx] - 10)
      }
    }
  })

  it("should bet and return bets when they leave match", async () => {
    let matchId: string | undefined
    let matches: IPublicMatch[] = []

    const checkMatch = (i, match) => {
      if (matches[i] && match?.matchSessionId !== matches[i].matchSessionId) {
        return false
      }

      return true
    }

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
        identities[0],
        matches[0].matchSessionId,
        { satsPerPlayer: 10 },
        ({ success, match }) => {
          if (success && match) {
            matches[0] = match
            return resolve()
          }
          reject(new Error("Failed to set match bet"))
        }
      )
    })

    const joinPromises = clients.map((c, i) => {
      const sendReady = (matchId: any, j: number, me?: IPublicPlayer | null) => {
        return new Promise<void>((resolve, reject) => {
          const prid = matches[j].me?.payRequestId
          if (!prid) {
            logger.error({ ...matches[j].me, wtf: true })
            return reject(new Error("Pay request not found!"))
          }

          apis[j].wallet
            .payRequest(String(prid), { headers: { Cookie: cookies[i] } })
            .then(() => {
              c.emit(EClientEvent.SET_PLAYER_READY, matchId, true, ({ success, match }) => {
                if (!checkMatch(i, match)) {
                  return
                }
                if (!match) {
                  return reject("Match not found ready")
                }
                matches[i] = match
                expect(success).to.equal(true)
                resolve()
              })
            })
            .catch((e) => {
              logger.fatal(e)
              process.exit(1)
            })
        })
      }

      if (i === 0) {
        return () => sendReady(matchId, 0)
      }
      return (teamIdx: 0 | 1) =>
        new Promise<void>((res, rej) => {
          c.emit(EClientEvent.JOIN_MATCH, matchId as string, teamIdx, ({ success, match }) => {
            if (!checkMatch(i, match)) {
              return
            }
            expect(success).to.equal(true)
            expect(match?.matchSessionId).to.equal(matchId)

            if (!match) {
              return rej("Match not found join match")
            }
            matches[i] = match

            sendReady(matchId, i).then(res)
          })
        })
    })

    let tidx: 0 | 1 = 0
    for (const joinPromise of joinPromises) {
      await joinPromise(tidx)
      tidx = Number(!tidx) as 0 | 1
    }

    for (const [i, c] of clients.entries()) {
      await new Promise<void>((resolve) => {
        c.emit(EClientEvent.LEAVE_MATCH, matchId as string, () => {
          resolve()
        })
      })

      const res = await apis[i].auth.getAuth({ headers: { Cookie: cookies[i] } })

      expect(res.data.wallet?.balanceInSats).to.equal(balances[i])
    }
  })
})
