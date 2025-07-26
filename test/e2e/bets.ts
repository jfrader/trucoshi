import { io as Client, Socket } from "socket.io-client"
import { assert, expect } from "chai"
import {
  EAnswerCommand,
  ECommand,
  EEnvidoAnswerCommand,
  EHandState,
  ICard,
  IPublicMatch,
  IPublicPlayer,
} from "../../src/types"
import { ITrucoshi, Trucoshi } from "../../src/server/classes"
import logger from "../../src/utils/logger"
import { Api, User } from "lightning-accounts"
import {
  ClientToServerEvents,
  EClientEvent,
  EServerEvent,
  ServerToClientEvents,
} from "../../src/events"
import { EMatchState } from "@prisma/client"
import { sessionMiddleware, trucoshiMiddleware } from "../../src/server"

describe("Bets", () => {
  let server: ITrucoshi
  let clients: Socket<ServerToClientEvents, ClientToServerEvents>[] = []
  let apis: Api<unknown>[] = []
  let cookies: string[][] = []
  let balances: number[] = []
  let identities: string[] = []

  const handleError = (error: unknown, message: string): Error => {
    const err = error instanceof Error ? error : new Error(message)
    logger.error({ error: err, message })
    return err
  }

  async function createUser(index: number): Promise<[User, string]> {
    const api = new Api({
      baseURL: process.env.APP_LIGHTNING_ACCOUNTS_URL,
      withCredentials: true,
    })
    apis.push(api)

    const response = await api.auth.loginCreate({
      email: `${index}_e2e_player@trucoshi.com`,
      password: "secret",
    })

    const identityJwt = response.headers["set-cookie"]
      ?.find((cookie) => cookie.includes("identity"))
      ?.match(new RegExp(`^${"identity"}=(.+?);`))?.[1]

    if (!identityJwt || !response.data.user) {
      throw handleError(null, "Failed to get identity JWT or user from lightning accounts")
    }

    cookies[index] = response.headers["set-cookie"] || []
    identities[index] = identityJwt
    return [response.data.user, identityJwt]
  }

  function createClient(
    user: User,
    identity: string,
    index: number
  ): Socket<ServerToClientEvents, ClientToServerEvents> {
    const client = Client(`http://localhost:${process.env.APP_PORT || 9999}`, {
      autoConnect: false,
      withCredentials: true,
      auth: {
        name: `player${index}`,
        identity,
        user,
      },
    })
    client.connect()
    return client
  }

  before(async () => {
    server = Trucoshi({ port: Number(process.env.APP_PORT) || 9999, serverVersion: "1" })

    await new Promise<void>((resolve, reject) => {
      server
        .listen(
          (io) => {
            io.use(sessionMiddleware(server))
            io.use(trucoshiMiddleware(server))
            io.on("connection", (socket) => {
              socket.setMaxListeners(50)
            })
            resolve()
          },
          { redis: false, lightningAccounts: true, store: true }
        )
        .catch((err) => reject(handleError(err, "Server listen failed")))
    })

    for (let i = 0; i < 6; i++) {
      try {
        const [user, identity] = await createUser(i)
        clients.push(createClient(user, identity, i))
      } catch (err) {
        throw handleError(err, `Failed to create user or client ${i}`)
      }
    }
  })

  after(() => {
    server.io.close()
    clients.forEach((client) => client.close())
  })

  beforeEach(async () => {
    clients.forEach((client) => client.removeAllListeners())

    balances = await Promise.all(
      clients.map(async (_, i) => {
        try {
          const response = await apis[i].auth.getAuth({ headers: { Cookie: cookies[i] } })
          return response.data.wallet?.balanceInSats || 0
        } catch (err) {
          throw handleError(err, `Failed to fetch balance for client ${i}`)
        }
      })
    )
  })

  it("should send ping", (done) => {
    clients[0].on(EServerEvent.PONG, (_a, b) => {
      assert.equal(b, 1234)
      done()
    })
    clients[0].emit(EClientEvent.PING, 1234)
  })

  it("should bet, play, and award winners", async () => {
    let matchId: string | undefined
    const matches: IPublicMatch[] = []

    const checkMatch = (index: number, match?: IPublicMatch | null): boolean => {
      if (!match || (matches[index] && match.matchSessionId !== matches[index].matchSessionId)) {
        return false
      }
      return true
    }

    matchId = await new Promise<string>((resolve, reject) => {
      clients[0].emit(EClientEvent.CREATE_MATCH, ({ match }) => {
        if (!checkMatch(0, match)) return
        if (!match?.matchSessionId) {
          return reject(handleError(null, "Match not found on create"))
        }
        matches[0] = match
        resolve(match.matchSessionId)
      })
    })

    clients.forEach((client, i) => {
      client.on(EServerEvent.WAITING_PLAY, (match, callback) => {
        if (
          !checkMatch(i, match) ||
          !match.me?.isTurn ||
          match.handState !== EHandState.WAITING_PLAY ||
          !match.me?.hand
        ) {
          return
        }
        callback({ card: match.me.hand[0] as ICard, cardIdx: 0 })
      })

      client.on(EServerEvent.UPDATE_MATCH, (match) => {
        if (!checkMatch(i, match)) return
        matches[i] = match
        if (i === 0 && match.winner && match.state !== EMatchState.FINISHED) {
          ;(async () => {
            const winner = matches[0]?.winner
            expect(winner?.points.buenas).to.be.greaterThanOrEqual(9)

            for (const [idx] of clients.entries()) {
              const res = await apis[idx].auth.getAuth({ headers: { Cookie: cookies[idx] } })
              const expectedBalance =
                winner?.id === matches[idx].me?.teamIdx ? balances[idx] + 9 : balances[idx] - 10
              expect(res.data.wallet?.balanceInSats).to.equal(expectedBalance)
            }
          })().catch((err) => {
            throw handleError(err, "Winner balance verification failed")
          })
        }
      })
    })

    await new Promise<void>((resolve, reject) => {
      clients[0].emit(
        EClientEvent.SET_MATCH_OPTIONS,
        matches[0].matchSessionId,
        { satsPerPlayer: 10, flor: false },
        ({ success, match }) => {
          if (!success || !match) {
            return reject(handleError(null, "Failed to set match bet"))
          }
          matches[0] = match
          resolve()
        }
      )
    })

    const joinPromises = clients.map((client, i) => {
      const sendReady = async (matchId: string, index: number) => {
        const prid = matches[index].me?.payRequestId
        if (!prid) {
          throw handleError(null, `Pay request not found for client ${index}`)
        }
        await apis[index].wallet.payRequest(String(prid), { headers: { Cookie: cookies[i] } })
        await new Promise<void>((resolve, reject) => {
          client.emit(EClientEvent.SET_PLAYER_READY, matchId, true, ({ success, match }) => {
            if (!checkMatch(i, match) || !match) {
              return reject(handleError(null, "Match not found on set ready"))
            }
            matches[i] = match
            expect(success).to.equal(true)
            resolve()
          })
        })
      }

      if (i === 0) {
        return () => sendReady(matchId, 0)
      }
      return async (teamIdx: 0 | 1) => {
        await new Promise<void>((resolve, reject) => {
          client.emit(EClientEvent.JOIN_MATCH, matchId, teamIdx, ({ success, match }) => {
            if (!checkMatch(i, match) || !match) {
              return reject(handleError(null, "Match not found on join"))
            }
            expect(success).to.equal(true)
            expect(match.matchSessionId).to.equal(matchId)
            matches[i] = match
            resolve()
          })
        })
        await sendReady(matchId, i)
      }
    })

    let teamIdx: 0 | 1 = 0
    for (const joinPromise of joinPromises) {
      await joinPromise(teamIdx)
      teamIdx = Number(!teamIdx) as 0 | 1
    }

    await new Promise<void>((resolve, reject) => {
      clients[0].emit(
        EClientEvent.START_MATCH,
        matches[0].matchSessionId,
        ({ success, matchSessionId }) => {
          if (!success || matchSessionId !== matchId) {
            return reject(handleError(null, "Failed to start match"))
          }
          resolve()
        }
      )
    })
  })

  it("should bet and return bets when players leave match", async () => {
    let matchId: string | undefined
    const matches: IPublicMatch[] = []

    const checkMatch = (index: number, match?: IPublicMatch | null): boolean => {
      if (!match || (matches[index] && match.matchSessionId !== matches[index].matchSessionId)) {
        return false
      }
      return true
    }

    matchId = await new Promise<string>((resolve, reject) => {
      clients[0].emit(EClientEvent.CREATE_MATCH, ({ match }) => {
        if (!checkMatch(0, match) || !match?.matchSessionId) {
          return reject(handleError(null, "Match not found on create"))
        }
        matches[0] = match
        resolve(match.matchSessionId)
      })
    })

    await new Promise<void>((resolve, reject) => {
      clients[0].emit(
        EClientEvent.SET_MATCH_OPTIONS,
        matches[0].matchSessionId,
        { satsPerPlayer: 10, flor: false },
        ({ success, match }) => {
          if (!success || !match) {
            return reject(handleError(null, "Failed to set match bet"))
          }
          matches[0] = match
          resolve()
        }
      )
    })

    const joinPromises = clients.map((client, i) => {
      const sendReady = async (matchId: string, index: number) => {
        const prid = matches[index].me?.payRequestId
        if (!prid) {
          throw handleError(null, `Pay request not found for client ${index}`)
        }
        await apis[index].wallet.payRequest(String(prid), { headers: { Cookie: cookies[i] } })
        await new Promise<void>((resolve, reject) => {
          client.emit(EClientEvent.SET_PLAYER_READY, matchId, true, ({ success, match }) => {
            if (!checkMatch(i, match) || !match) {
              return reject(handleError(null, "Match not found on set ready"))
            }
            matches[i] = match
            expect(success).to.equal(true)
            resolve()
          })
        })
      }

      if (i === 0) {
        return () => sendReady(matchId, 0)
      }
      return async (teamIdx: 0 | 1) => {
        await new Promise<void>((resolve, reject) => {
          client.emit(EClientEvent.JOIN_MATCH, matchId, teamIdx, ({ success, match }) => {
            if (!checkMatch(i, match) || !match) {
              return reject(handleError(null, "Match not found on join"))
            }
            expect(success).to.equal(true)
            expect(match.matchSessionId).to.equal(matchId)
            matches[i] = match
            resolve()
          })
        })
        await sendReady(matchId, i)
      }
    })

    let teamIdx: 0 | 1 = 0
    for (const joinPromise of joinPromises) {
      await joinPromise(teamIdx)
      teamIdx = Number(!teamIdx) as 0 | 1
    }

    for (const [i, client] of clients.entries()) {
      await new Promise<void>((resolve, reject) => {
        client.emit(EClientEvent.LEAVE_MATCH, matchId as string, () => resolve())
      })

      const res = await apis[i].auth.getAuth({ headers: { Cookie: cookies[i] } })
      expect(res.data.wallet?.balanceInSats).to.equal(balances[i])
    }
  })
})
