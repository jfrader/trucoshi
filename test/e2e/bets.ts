import { io as Client, Socket } from "socket.io-client"
import { assert, expect } from "chai"
import { EHandState, ICard, IPublicMatch } from "../../src/types"
import { ITrucoshi, Trucoshi } from "../../src/server/classes"
import { Api, User } from "lightning-accounts"
import {
  ClientToServerEvents,
  EClientEvent,
  EServerEvent,
  ServerToClientEvents,
} from "../../src/events"
import { EMatchState, PrismaClient } from "@prisma/client"
import { sessionMiddleware, trucoshiMiddleware } from "../../src/server"
import { accountsApi, getCookieName } from "../../src/accounts/client"

describe("Bets", () => {
  let server: ITrucoshi
  let clients: Socket<ServerToClientEvents, ClientToServerEvents>[] = []
  let apis: Api<unknown>[] = []
  let cookies: string[][] = []
  let balances: number[] = []
  let identities: string[] = []
  let prisma: PrismaClient

  // Helper to handle errors consistently
  const handleError = (error: unknown, message: string): Error => {
    const err = error instanceof Error ? error : new Error(message)
    throw err
  }

  // Helper to create a user and get their identity JWT
  async function createUser(index: number): Promise<[User, string]> {
    const api = accountsApi
    apis[index] = accountsApi

    const response = await api.auth.loginUser({
      email: `${index}_e2e_player@trucoshi.com`,
      password: "secret",
    })

    const identityJwt = response.headers["set-cookie"]
      ?.find((cookie) => cookie.includes(getCookieName("identity")))
      ?.match(new RegExp(`^${getCookieName("identity")}=(.+?);`))?.[1]

    if (!identityJwt || !response.data.user) {
      throw handleError(null, `Failed to get identity JWT or user for player ${index}`)
    }

    cookies[index] = response.headers["set-cookie"] || []
    identities[index] = identityJwt
    return [response.data.user, identityJwt]
  }

  // Helper to create a socket.io client
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

  // Helper to join a match and pay the bet
  async function joinMatchAndPayBet(
    client: Socket<ServerToClientEvents, ClientToServerEvents>,
    index: number,
    matchId: string,
    teamIdx: 0 | 1,
    matches: IPublicMatch[]
  ) {
    await new Promise<void>((resolve, reject) => {
      client.emit(EClientEvent.JOIN_MATCH, matchId, teamIdx, ({ success, match, error }) => {
        if (!match || match.matchSessionId !== matchId || !success) {
          return reject(handleError(error, `Player ${index} failed to join match ${matchId}`))
        }
        matches[index] = match
        expect(success).to.be.true
        expect(match.matchSessionId).to.equal(matchId)
        resolve()
      })
    })

    const prid = matches[index].me?.payRequestId
    if (!prid) {
      throw handleError(null, `Pay request not found for player ${index}`)
    }

    await apis[index].wallet.payRequest(String(prid), { headers: { Cookie: cookies[index] } })
    await new Promise<void>((resolve, reject) => {
      client.emit(EClientEvent.SET_PLAYER_READY, matchId, true, ({ success, match, error }) => {
        if (!match || match.matchSessionId !== matchId || !success) {
          return reject(
            handleError(error, `Player ${index} failed to set ready for match ${matchId}`)
          )
        }
        matches[index] = match
        expect(success).to.be.true
        resolve()
      })
    })
  }

  // Setup before all tests
  before(async () => {
    server = Trucoshi({ port: Number(process.env.APP_PORT) || 9999, serverVersion: "1" })
    prisma = new PrismaClient()

    await new Promise<void>((resolve, reject) => {
      server
        .listen(
          (io) => {
            io.use(sessionMiddleware(server))
            io.use(trucoshiMiddleware(server))
            io.on("connection", (socket) => socket.setMaxListeners(50))
            resolve()
          },
          { redis: false, lightningAccounts: true, store: true }
        )
        .catch((err) => reject(handleError(err, "Server listen failed")))
    })

    for (let i = 0; i < 6; i++) {
      const [user, identity] = await createUser(i)
      clients[i] = createClient(user, identity, i)
    }
  })

  // Cleanup after all tests
  after(async () => {
    server.io.close()
    clients.forEach((client) => client.close())
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    clients.forEach((client) => client.removeAllListeners())
    await server.store?.$transaction(async (tx) => {
      await tx.matchHand.deleteMany({})
      await tx.matchBet.deleteMany({})
      await tx.matchPlayer.deleteMany({})
      await tx.match.deleteMany({})
    })
    const remainingMatches = await prisma.match.count()
    expect(remainingMatches).to.equal(0, "Database should be empty before test")
    balances = await Promise.all(
      clients.map(async (_, i) => {
        const response = await apis[i].auth.getUserProfile({
          headers: { Cookie: cookies[i] },
        })
        return response.data.wallet?.balanceInSats || 0
      })
    )
  })

  afterEach(async () => {
    clients.forEach((client) => client.removeAllListeners())
    await server.store?.$transaction(async (tx) => {
      await tx.matchHand.deleteMany({ where: { match: { state: { not: EMatchState.FINISHED } } } })
      await tx.matchBet.deleteMany({ where: { match: { state: { not: EMatchState.FINISHED } } } })
      await tx.matchPlayer.deleteMany({
        where: { match: { state: { not: EMatchState.FINISHED } } },
      })
      await tx.match.deleteMany({ where: { state: { not: EMatchState.FINISHED } } })
    })
    const remainingMatches = await prisma.match.count({
      where: { state: { not: EMatchState.FINISHED } },
    })
    expect(remainingMatches).to.equal(0, "Non-finished matches should be empty after test")
    clients.forEach((client) => client.disconnect())
    clients.forEach((client) => client.connect())
  })

  describe("Basic Connectivity", () => {
    it("should send and receive ping", (done) => {
      clients[0].on(EServerEvent.PONG, (_a, b) => {
        expect(b).to.equal(1234)
        done()
      })
      clients[0].emit(EClientEvent.PING, 1234)
    })
  })

  describe("Betting and Awarding", () => {
    it("should bet, play, and award winners", async () => {
      const matches: IPublicMatch[] = []
      let matchId: string

      matchId = await new Promise<string>((resolve, reject) => {
        clients[0].emit(EClientEvent.CREATE_MATCH, ({ match }) => {
          if (!match?.matchSessionId) {
            return reject(handleError(null, "Match not found on create"))
          }
          matches[0] = match
          resolve(match.matchSessionId)
        })
      })

      await new Promise<void>((resolve, reject) => {
        clients[0].emit(
          EClientEvent.SET_MATCH_OPTIONS,
          matchId,
          { satsPerPlayer: 10, flor: false },
          ({ success, match, error }) => {
            if (!success || !match) {
              return reject(handleError(error, "Failed to set match bet"))
            }
            matches[0] = match
            resolve()
          }
        )
      })

      clients.forEach((client, i) => {
        client.on(EServerEvent.WAITING_PLAY, (match, callback) => {
          if (
            !match ||
            match.matchSessionId !== matchId ||
            !match.me?.isTurn ||
            match.handState !== EHandState.WAITING_PLAY ||
            !match.me?.hand
          ) {
            return
          }
          callback({ card: match.me.hand[0] as ICard, cardIdx: 0 })
        })

        client.on(EServerEvent.UPDATE_MATCH, async (match) => {
          if (!match || match.matchSessionId !== matchId) return
          matches[i] = match

          if (i === 0 && match.winner && match.state === EMatchState.FINISHED) {
            try {
              const winner = match.winner
              expect(winner.points.buenas).to.be.greaterThanOrEqual(9)

              for (const [idx] of clients.entries()) {
                const res = await apis[idx].auth.getUserProfile({
                  headers: { Cookie: cookies[idx] },
                })
                const expectedBalance =
                  winner.id === matches[idx].me?.teamIdx ? balances[idx] + 9 : balances[idx] - 10
                expect(res.data.wallet?.balanceInSats).to.equal(
                  expectedBalance,
                  `Player ${idx} balance verification failed`
                )
              }

              const dbMatch = await prisma.match.findUnique({
                where: { id: matches[0].id },
                include: { bet: true, players: true },
              })
              expect(dbMatch?.bet?.winnerAwarded).to.be.true
              expect(dbMatch?.bet?.refunded).to.be.false
              expect(dbMatch?.bet?.satsPerPlayer).to.equal(10)
              for (const player of dbMatch?.players || []) {
                if (player.teamIdx === winner.id) {
                  expect(player.satsReceived).to.be.greaterThan(0)
                } else {
                  expect(player.satsReceived).to.equal(0)
                }
                expect(player.satsPaid).to.equal(10)
              }
            } catch (err) {
              throw handleError(err, "Winner balance or database verification failed")
            }
          }
        })
      })

      const joinPromises = clients.map((client, i) => {
        const sendReady = async (matchId: string, index: number) => {
          const prid = matches[index].me?.payRequestId
          if (!prid) {
            throw handleError(null, `Pay request not found for client ${index}`)
          }
          await apis[index].wallet.payRequest(String(prid), {
            headers: { Cookie: cookies[i] },
          })
          await new Promise<void>((resolve, reject) => {
            client.emit(
              EClientEvent.SET_PLAYER_READY,
              matchId,
              true,
              ({ success, match, error }) => {
                if (!match || match.matchSessionId !== matchId || !success) {
                  return reject(
                    handleError(error, `Player ${index} failed to set ready for match ${matchId}`)
                  )
                }
                matches[index] = match
                expect(success).to.be.true
                resolve()
              }
            )
          })
        }

        if (i === 0) {
          return () => sendReady(matchId, 0)
        }
        return async (teamIdx: 0 | 1) => {
          await new Promise<void>((resolve, reject) => {
            client.emit(EClientEvent.JOIN_MATCH, matchId, teamIdx, ({ success, match, error }) => {
              if (!match || match.matchSessionId !== matchId || !success) {
                return reject(handleError(error, `Player ${i} failed to join match ${matchId}`))
              }
              matches[i] = match
              expect(success).to.be.true
              expect(match.matchSessionId).to.equal(matchId)
              resolve()
            })
          })
          await sendReady(matchId, i)
        }
      })

      let teamIdx: 0 | 1 = 0
      for (const [i, joinPromise] of joinPromises.entries()) {
        await joinPromise(i % 2 === 0 ? 0 : 1)
      }

      await new Promise<void>((resolve, reject) => {
        clients[0].emit(EClientEvent.START_MATCH, matchId, ({ success, matchSessionId, error }) => {
          if (!success || matchSessionId !== matchId) {
            return reject(handleError(error, "Failed to start match"))
          }
          resolve()
        })
      })
    })

    it("should refund bets when setting satsPerPlayer to 0", async () => {
      const matches: IPublicMatch[] = []
      let matchId: string

      matchId = await new Promise<string>((resolve, reject) => {
        clients[0].emit(EClientEvent.CREATE_MATCH, ({ match }) => {
          if (!match?.matchSessionId) {
            return reject(handleError(null, "Match not found on create"))
          }
          matches[0] = match
          resolve(match.matchSessionId)
        })
      })

      await new Promise<void>((resolve, reject) => {
        clients[0].emit(
          EClientEvent.SET_MATCH_OPTIONS,
          matchId,
          { satsPerPlayer: 10, flor: false },
          ({ success, match, error }) => {
            if (!success || !match) {
              return reject(handleError(error, "Failed to set match bet"))
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
          await apis[index].wallet.payRequest(String(prid), {
            headers: { Cookie: cookies[i] },
          })
          await new Promise<void>((resolve, reject) => {
            client.emit(
              EClientEvent.SET_PLAYER_READY,
              matchId,
              true,
              ({ success, match, error }) => {
                if (!match || match.matchSessionId !== matchId || !success) {
                  return reject(
                    handleError(error, `Player ${index} failed to set ready for match ${matchId}`)
                  )
                }
                matches[index] = match
                expect(success).to.be.true
                resolve()
              }
            )
          })
        }

        if (i === 0) {
          return () => sendReady(matchId, 0)
        }
        return async (teamIdx: 0 | 1) => {
          await new Promise<void>((resolve, reject) => {
            client.emit(EClientEvent.JOIN_MATCH, matchId, teamIdx, ({ success, match, error }) => {
              if (!match || match.matchSessionId !== matchId || !success) {
                return reject(handleError(error, `Player ${i} failed to join match ${matchId}`))
              }
              matches[i] = match
              expect(success).to.be.true
              expect(match.matchSessionId).to.equal(matchId)
              resolve()
            })
          })
          await sendReady(matchId, i)
        }
      })

      let teamIdx: 0 | 1 = 0
      for (const [i, joinPromise] of joinPromises.entries()) {
        await joinPromise(i % 2 === 0 ? 0 : 1)
      }

      await new Promise<void>((resolve, reject) => {
        clients[0].emit(
          EClientEvent.SET_MATCH_OPTIONS,
          matchId,
          { satsPerPlayer: 0 },
          ({ success, match, error }) => {
            if (!success || !match) {
              return reject(handleError(error, "Failed to set satsPerPlayer to 0"))
            }
            matches[0] = match
            resolve()
          }
        )
      })

      for (const [i] of clients.entries()) {
        const res = await apis[i].auth.getUserProfile({ headers: { Cookie: cookies[i] } })
        expect(res.data.wallet?.balanceInSats).to.equal(
          balances[i],
          `Player ${i} balance should be unchanged after refund`
        )
      }

      const dbMatch = await prisma.match.findUnique({
        where: { id: matches[0].id },
        include: { bet: true, players: true },
      })
      expect(dbMatch?.bet?.refunded).to.be.true
      expect(dbMatch?.bet?.winnerAwarded).to.be.false
      expect(dbMatch?.bet?.satsPerPlayer).to.equal(10)
      for (const player of dbMatch?.players || []) {
        expect(player.satsPaid).to.equal(0)
        expect(player.satsReceived).to.equal(0)
        expect(player.payRequestId).to.be.null
      }
    })

    it("should refund bets when players leave match", async () => {
      const matches: IPublicMatch[] = []
      let matchId: string

      matchId = await new Promise<string>((resolve, reject) => {
        clients[0].emit(EClientEvent.CREATE_MATCH, ({ match }) => {
          if (!match?.matchSessionId) {
            return reject(handleError(null, "Match not found on create"))
          }
          matches[0] = match
          resolve(match.matchSessionId)
        })
      })

      await new Promise<void>((resolve, reject) => {
        clients[0].emit(
          EClientEvent.SET_MATCH_OPTIONS,
          matchId,
          { satsPerPlayer: 10, flor: false },
          ({ success, match, error }) => {
            if (!success || !match) {
              return reject(handleError(error, "Failed to set match bet"))
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
          await apis[index].wallet.payRequest(String(prid), {
            headers: { Cookie: cookies[i] },
          })
          await new Promise<void>((resolve, reject) => {
            client.emit(
              EClientEvent.SET_PLAYER_READY,
              matchId,
              true,
              ({ success, match, error }) => {
                if (!match || match.matchSessionId !== matchId || !success) {
                  return reject(
                    handleError(error, `Player ${index} failed to set ready for match ${matchId}`)
                  )
                }
                matches[index] = match
                expect(success).to.be.true
                resolve()
              }
            )
          })
        }

        if (i === 0) {
          return () => sendReady(matchId, 0)
        }
        return async (teamIdx: 0 | 1) => {
          await new Promise<void>((resolve, reject) => {
            client.emit(EClientEvent.JOIN_MATCH, matchId, teamIdx, ({ success, match, error }) => {
              if (!match || match.matchSessionId !== matchId || !success) {
                return reject(handleError(error, `Player ${i} failed to join match ${matchId}`))
              }
              matches[i] = match
              expect(success).to.be.true
              expect(match.matchSessionId).to.equal(matchId)
              resolve()
            })
          })
          await sendReady(matchId, i)
        }
      })

      let teamIdx: 0 | 1 = 0
      for (const [i, joinPromise] of joinPromises.entries()) {
        await joinPromise(i % 2 === 0 ? 0 : 1)
      }

      for (const [i, client] of clients.entries()) {
        await new Promise<void>((resolve) => {
          client.emit(EClientEvent.LEAVE_MATCH, matchId, () => resolve())
        })

        const res = await apis[i].auth.getUserProfile({ headers: { Cookie: cookies[i] } })
        expect(res.data.wallet?.balanceInSats).to.equal(
          balances[i],
          `Player ${i} balance should be unchanged after refund`
        )
      }

      const dbMatch = await prisma.match.findUnique({
        where: { id: matches[0].id },
        include: { bet: true, players: true },
      })
      expect(dbMatch).to.be.null
    })

    it("should refund bets during reconciliation after server restart", async () => {
      const matches: IPublicMatch[] = []
      let matchId: string

      matchId = await new Promise<string>((resolve, reject) => {
        clients[0].emit(EClientEvent.CREATE_MATCH, ({ match }) => {
          if (!match?.matchSessionId) {
            return reject(handleError(null, "Match not found on create"))
          }
          matches[0] = match
          resolve(match.matchSessionId)
        })
      })

      await new Promise<void>((resolve, reject) => {
        clients[0].emit(
          EClientEvent.SET_MATCH_OPTIONS,
          matchId,
          { satsPerPlayer: 10, flor: false },
          ({ success, match, error }) => {
            if (!success || !match) {
              return reject(handleError(error, "Failed to set match bet"))
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
          await apis[index].wallet.payRequest(String(prid), {
            headers: { Cookie: cookies[i] },
          })
          await new Promise<void>((resolve, reject) => {
            client.emit(
              EClientEvent.SET_PLAYER_READY,
              matchId,
              true,
              ({ success, match, error }) => {
                if (!match || match.matchSessionId !== matchId || !success) {
                  return reject(
                    handleError(error, `Player ${index} failed to set ready for match ${matchId}`)
                  )
                }
                matches[index] = match
                expect(success).to.be.true
                resolve()
              }
            )
          })
        }

        if (i === 0) {
          return () => sendReady(matchId, 0)
        }
        return async (teamIdx: 0 | 1) => {
          await new Promise<void>((resolve, reject) => {
            client.emit(EClientEvent.JOIN_MATCH, matchId, teamIdx, ({ success, match, error }) => {
              if (!match || match.matchSessionId !== matchId || !success) {
                return reject(handleError(error, `Player ${i} failed to join match ${matchId}`))
              }
              matches[i] = match
              expect(success).to.be.true
              expect(match.matchSessionId).to.equal(matchId)
              resolve()
            })
          })
          await sendReady(matchId, i)
        }
      })

      let teamIdx: 0 | 1 = 0
      for (const [i, joinPromise] of joinPromises.entries()) {
        await joinPromise(i % 2 === 0 ? 0 : 1)
      }

      await new Promise<void>((resolve, reject) => {
        clients[0].emit(EClientEvent.START_MATCH, matchId, ({ success, matchSessionId, error }) => {
          if (!success || matchSessionId !== matchId) {
            return reject(handleError(error, "Failed to start match"))
          }
          resolve()
        })
      })

      // Simulate server shutdown
      server.io.close()
      await prisma.$disconnect()

      // Restart server
      await prisma.$connect()
      server = Trucoshi({ port: Number(process.env.APP_PORT) || 9999, serverVersion: "1" })
      await new Promise<void>((resolve, reject) => {
        server
          .listen(
            (io) => {
              io.use(sessionMiddleware(server))
              io.use(trucoshiMiddleware(server))
              io.on("connection", (socket) => socket.setMaxListeners(50))
              resolve()
            },
            { redis: false, lightningAccounts: true, store: true }
          )
          .catch((err) => reject(handleError(err, "Server restart failed")))
      })

      // Verify refunds and database state
      for (const [i] of clients.entries()) {
        const res = await apis[i].auth.getUserProfile({ headers: { Cookie: cookies[i] } })
        expect(res.data.wallet?.balanceInSats).to.equal(
          balances[i],
          `Player ${i} balance should be unchanged after reconciliation refund`
        )
      }

      const dbMatch = await prisma.match.findUnique({
        where: { id: matches[0].id },
        include: { bet: true, players: true },
      })
      expect(dbMatch?.bet?.refunded).to.be.true
      expect(dbMatch?.bet?.winnerAwarded).to.be.false
      expect(dbMatch?.bet?.satsPerPlayer).to.equal(10)
      for (const player of dbMatch?.players || []) {
        expect(player.satsPaid).to.equal(0)
        expect(player.satsReceived).to.equal(0)
        expect(player.payRequestId).to.be.null
      }
    })

    it("should handle slow API responses when refunding bets", async () => {
      const matches: IPublicMatch[] = []
      let matchId: string

      matchId = await new Promise<string>((resolve, reject) => {
        clients[0].emit(EClientEvent.CREATE_MATCH, ({ match }) => {
          if (!match?.matchSessionId) {
            return reject(handleError(null, "Match not found on create"))
          }
          matches[0] = match
          resolve(match.matchSessionId)
        })
      })

      await new Promise<void>((resolve, reject) => {
        clients[0].emit(
          EClientEvent.SET_MATCH_OPTIONS,
          matchId,
          { satsPerPlayer: 10, flor: false },
          ({ success, match, error }) => {
            if (!success || !match) {
              return reject(handleError(error, "Failed to set match bet"))
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
          await apis[index].wallet.payRequest(String(prid), {
            headers: { Cookie: cookies[i] },
          })
          await new Promise<void>((resolve, reject) => {
            client.emit(
              EClientEvent.SET_PLAYER_READY,
              matchId,
              true,
              ({ success, match, error }) => {
                if (!match || match.matchSessionId !== matchId || !success) {
                  return reject(
                    handleError(error, `Player ${index} failed to set ready for match ${matchId}`)
                  )
                }
                matches[index] = match
                expect(success).to.be.true
                resolve()
              }
            )
          })
        }

        if (i === 0) {
          return () => sendReady(matchId, 0)
        }
        return async (teamIdx: 0 | 1) => {
          await new Promise<void>((resolve, reject) => {
            client.emit(EClientEvent.JOIN_MATCH, matchId, teamIdx, ({ success, match, error }) => {
              if (!match || match.matchSessionId !== matchId || !success) {
                return reject(handleError(error, `Player ${i} failed to join match ${matchId}`))
              }
              matches[i] = match
              expect(success).to.be.true
              expect(match.matchSessionId).to.equal(matchId)
              resolve()
            })
          })
          await sendReady(matchId, i)
        }
      })

      let teamIdx: 0 | 1 = 0
      for (const [i, joinPromise] of joinPromises.entries()) {
        await joinPromise(i % 2 === 0 ? 0 : 1)
      }

      await new Promise<void>((resolve, reject) => {
        clients[0].emit(
          EClientEvent.SET_MATCH_OPTIONS,
          matchId,
          { satsPerPlayer: 0 },
          ({ success, match, error }) => {
            if (!success || !match) {
              return reject(handleError(error, "Failed to set satsPerPlayer to 0"))
            }
            matches[0] = match
            resolve()
          }
        )
      })

      for (const [i] of clients.entries()) {
        const res = await apis[i].auth.getUserProfile({ headers: { Cookie: cookies[i] } })
        expect(res.data.wallet?.balanceInSats).to.equal(
          balances[i],
          `Player ${i} balance should be unchanged after refund`
        )
      }

      const dbMatch = await prisma.match.findUnique({
        where: { id: matches[0].id },
        include: { bet: true, players: true },
      })
      expect(dbMatch?.bet?.refunded).to.be.true
      expect(dbMatch?.bet?.winnerAwarded).to.be.false
      expect(dbMatch?.bet?.satsPerPlayer).to.equal(10)
      for (const player of dbMatch?.players || []) {
        expect(player.satsPaid).to.equal(0)
        expect(player.satsReceived).to.equal(0)
        expect(player.payRequestId).to.be.null
      }
    })

    it("should refund old bets and create new payment requests when changing bet from one positive number to another", async () => {
      const matches: IPublicMatch[] = []
      let matchId: string

      // Create match
      matchId = await new Promise<string>((resolve, reject) => {
        clients[0].emit(EClientEvent.CREATE_MATCH, ({ match }) => {
          if (!match?.matchSessionId) {
            return reject(handleError(null, "Match not found on create"))
          }
          matches[0] = match
          resolve(match.matchSessionId)
        })
      })

      // Set initial bet to 10 sats
      await new Promise<void>((resolve, reject) => {
        clients[0].emit(
          EClientEvent.SET_MATCH_OPTIONS,
          matchId,
          { satsPerPlayer: 10, flor: false },
          ({ success, match, error }) => {
            if (!success || !match) {
              return reject(handleError(error, "Failed to set initial match bet"))
            }
            matches[0] = match
            resolve()
          }
        )
      })

      // Set up UPDATE_MATCH and WAITING_PLAY listeners
      const updatePromises: Promise<void>[] = []
      clients.slice(0, 2).forEach((client, i) => {
        updatePromises[i] = new Promise((resolve, reject) => {
          client.on(EServerEvent.UPDATE_MATCH, (match) => {
            if (!match || match.matchSessionId !== matchId) return
            matches[i] = match
            if (match.state === EMatchState.FINISHED && match.winner) {
              resolve()
            }
          })
          setTimeout(
            () =>
              reject(
                new Error(`Player ${i} did not receive FINISHED match state within 15 seconds`)
              ),
            15000
          )
        })
        client.on(EServerEvent.WAITING_PLAY, (match, callback) => {
          if (
            !match ||
            match.matchSessionId !== matchId ||
            !match.me?.isTurn ||
            match.handState !== EHandState.WAITING_PLAY ||
            !match.me?.hand
          ) {
            return
          }
          callback({ card: match.me.hand[0] as ICard, cardIdx: 0 })
        })
      })

      // Players join and pay initial bet
      await Promise.all(
        clients.slice(0, 2).map(async (client, i) => {
          await joinMatchAndPayBet(client, i, matchId, (i % 2) as 0 | 1, matches)
        })
      )

      // Verify initial payment requests
      const initialPrIds = matches.map((match) => match.me?.payRequestId).filter(Boolean)
      expect(initialPrIds.length).to.equal(2, "Both players should have payment requests")
      for (const [i, prid] of initialPrIds.entries()) {
        const pr = await apis[i].wallet.getPayRequest(String(prid))
        expect(pr.data.amountInSats).to.equal(
          10,
          `Initial payment request for player ${i} should be for 10 sats`
        )
        expect(pr.data.paid).to.be.true
      }

      // Change bet to 20 sats
      await new Promise<void>((resolve, reject) => {
        clients[0].emit(
          EClientEvent.SET_MATCH_OPTIONS,
          matchId,
          { satsPerPlayer: 20, flor: false },
          ({ success, match, error }) => {
            if (!success || !match) {
              return reject(handleError(error, "Failed to change bet to 20 sats"))
            }
            matches[0] = match
            resolve()
          }
        )
      })

      // Verify refunds and new payment requests
      for (const [i, client] of clients.slice(0, 2).entries()) {
        const res = await apis[i].auth.getUserProfile({ headers: { Cookie: cookies[i] } })
        expect(res.data.wallet?.balanceInSats).to.equal(
          balances[i],
          `Player ${i} balance should be restored after refund`
        )

        const newPrId = matches[i].me?.payRequestId
        expect(newPrId).to.not.equal(
          initialPrIds[i],
          `Player ${i} should have a new payment request ID`
        )
        const pr = await apis[i].wallet.getPayRequest(String(newPrId))
        expect(pr.data.amountInSats).to.equal(
          20,
          `New payment request for player ${i} should be for 20 sats`
        )
        expect(pr.data.paid).to.be.false
      }

      // Pay new bets with safeguard
      const paidPrIds = new Set<string>()
      await Promise.all(
        clients.slice(0, 2).map(async (client, i) => {
          const prid = matches[i].me?.payRequestId
          if (!prid) {
            throw handleError(null, `New pay request not found for player ${i}`)
          }
          if (paidPrIds.has(prid.toString())) {
            return
          }
          paidPrIds.add(prid.toString())
          await apis[i].wallet.payRequest(String(prid), { headers: { Cookie: cookies[i] } })
          await new Promise<void>((resolve, reject) => {
            client.emit(
              EClientEvent.SET_PLAYER_READY,
              matchId,
              true,
              ({ success, match, error }) => {
                if (!match || match.matchSessionId !== matchId || !success) {
                  return reject(
                    handleError(error, `Player ${i} failed to set ready for match ${matchId}`)
                  )
                }
                matches[i] = match
                expect(success).to.be.true
                resolve()
              }
            )
          })
        })
      )

      // Verify balances after paying new bets
      for (const [i] of clients.slice(0, 2).entries()) {
        const res = await apis[i].auth.getUserProfile({ headers: { Cookie: cookies[i] } })
        expect(res.data.wallet?.balanceInSats).to.equal(
          balances[i] - 20,
          `Player ${i} balance should reflect new 20 sats bet`
        )
      }

      // Start match
      await new Promise<void>((resolve, reject) => {
        clients[0].emit(EClientEvent.START_MATCH, matchId, ({ success, matchSessionId, error }) => {
          if (!success || matchSessionId !== matchId) {
            return reject(handleError(error, "Failed to start match"))
          }
          resolve()
        })
      })

      // Wait for match to finish
      await Promise.all(updatePromises)

      // Verify final database state
      const dbMatch = await prisma.match.findUnique({
        where: { id: matches[0].id },
        include: { bet: true, players: true },
      })
      expect(dbMatch?.state).to.equal(EMatchState.FINISHED, "Match should be FINISHED")
      expect(dbMatch?.bet?.satsPerPlayer).to.equal(20, "Match bet should be 20 sats")
      expect(dbMatch?.bet?.refunded).to.be.false
      expect(dbMatch?.bet?.winnerAwarded).to.be.true
      for (const player of dbMatch?.players || []) {
        expect(player.satsPaid).to.equal(20, `Player ${player.name} should have paid 20 sats`)
        expect(player.payRequestId).to.not.be.null
        if (player.teamIdx === dbMatch?.winnerIdx) {
          expect(player.satsReceived).to.be.greaterThan(
            0,
            `Player ${player.name} should have received award`
          )
        } else {
          expect(player.satsReceived).to.equal(
            0,
            `Player ${player.name} should not have received award`
          )
        }
      }

      // Verify final balances
      for (const [i] of clients.slice(0, 2).entries()) {
        const res = await apis[i].auth.getUserProfile({ headers: { Cookie: cookies[i] } })
        const match = matches[i]
        const pool = (dbMatch?.bet?.satsPerPlayer || 0) * 2
        const tax = Math.round((pool * 1) / 100) || 1
        const prize = pool - tax
        const winnersLength =
          dbMatch?.players.filter((p) => p.teamIdx === dbMatch.winnerIdx).length || 1
        const amountInSats = Math.floor(prize / winnersLength)
        const balanceAfterNewBet = balances[i] - 20
        const expectedBalance =
          match.winner && match.me?.teamIdx === match.winner.id
            ? balanceAfterNewBet + amountInSats
            : balanceAfterNewBet
        expect(res.data.wallet?.balanceInSats).to.equal(
          expectedBalance,
          `Player ${i} balance should reflect match outcome`
        )
      }
    })

    it("should handle payment failure during winner awarding", async () => {
      const matches: IPublicMatch[] = []
      let matchId: string

      // Mock accountsApi to simulate payment failure
      const originalPayUser = accountsApi.wallet.payUser
      accountsApi.wallet.payUser = async () => {
        throw new Error("Simulated payment failure")
      }

      // Create match
      matchId = await new Promise<string>((resolve, reject) => {
        clients[0].emit(EClientEvent.CREATE_MATCH, ({ match }) => {
          if (!match?.matchSessionId) {
            return reject(handleError(null, "Match not found on create"))
          }
          matches[0] = match
          resolve(match.matchSessionId)
        })
      })

      // Set match options with bet
      await new Promise<void>((resolve, reject) => {
        clients[0].emit(
          EClientEvent.SET_MATCH_OPTIONS,
          matchId,
          { satsPerPlayer: 10, flor: false },
          ({ success, match, error }) => {
            if (!success || !match) {
              return reject(handleError(error, "Failed to set match bet"))
            }
            matches[0] = match
            resolve()
          }
        )
      })

      // Set up event listeners for all clients
      clients.forEach((client, i) => {
        client.on(EServerEvent.WAITING_PLAY, (match, callback) => {
          if (
            !match ||
            match.matchSessionId !== matchId ||
            !match.me?.isTurn ||
            match.handState !== EHandState.WAITING_PLAY ||
            !match.me?.hand
          ) {
            return
          }
          callback({ card: match.me.hand[0] as ICard, cardIdx: 0 })
        })

        client.on(EServerEvent.UPDATE_MATCH, async (match) => {
          if (!match || match.matchSessionId !== matchId) return
          matches[i] = match
        })
      })

      // Join match and pay bets
      await Promise.all(
        clients.map(async (client, i) => {
          const join = async (teamIdx: 0 | 1) => {
            await joinMatchAndPayBet(client, i, matchId, teamIdx, matches)
          }
          if (i === 0) return join(0)
          return join((i % 2) as 0 | 1)
        })
      )

      // Start match
      await new Promise<void>((resolve, reject) => {
        clients[0].emit(EClientEvent.START_MATCH, matchId, ({ success, matchSessionId, error }) => {
          if (!success || matchSessionId !== matchId) {
            return reject(handleError(error, "Failed to start match"))
          }
          resolve()
        })
      })

      // Wait for match to finish
      await new Promise<void>((resolve, reject) => {
        clients[0].on(EServerEvent.UPDATE_MATCH, (match) => {
          if (!match || match.matchSessionId !== matchId) return
          matches[0] = match
          if (match.state === EMatchState.FINISHED && match.winner) {
            resolve()
          }
        })
        // Timeout to prevent hanging
        setTimeout(() => reject(new Error("Match did not finish within 15 seconds")), 15000)
      })

      // Verify database state before reconciliation
      const dbMatch = await prisma.match.findUnique({
        where: { id: matches[0].id },
        include: { bet: true, players: true },
      })
      expect(dbMatch?.state).to.equal(EMatchState.FINISHED, "Match should be marked as FINISHED")
      expect(dbMatch?.bet?.winnerAwarded).to.be.false // Due to payment failure
      expect(dbMatch?.bet?.refunded).to.be.false
      for (const player of dbMatch?.players || []) {
        expect(player.satsReceived).to.equal(0, `Player ${player.name} should not receive sats`)
        expect(player.satsPaid).to.equal(10, `Player ${player.name} should have paid 10 sats`)
      }

      // Verify balances before reconciliation
      for (const [i] of clients.entries()) {
        const res = await apis[i].auth.getUserProfile({ headers: { Cookie: cookies[i] } })
        expect(res.data.wallet?.balanceInSats).to.equal(
          balances[i] - 10,
          `Player ${i} balance should reflect bet deduction`
        )
      }

      // Simulate server restart for reconciliation
      server.io.close()
      await prisma.$disconnect()

      accountsApi.wallet.payUser = originalPayUser

      await prisma.$connect()
      server = Trucoshi({ port: Number(process.env.APP_PORT) || 9999, serverVersion: "1" })
      await new Promise<void>((resolve, reject) => {
        server
          .listen(
            (io) => {
              io.use(sessionMiddleware(server))
              io.use(trucoshiMiddleware(server))
              io.on("connection", (socket) => socket.setMaxListeners(50))
              resolve()
            },
            { redis: false, lightningAccounts: true, store: true }
          )
          .catch((err) => reject(handleError(err, "Server restart failed")))
      })

      // Verify database state after reconciliation
      const dbMatchAfter = await prisma.match.findUnique({
        where: { id: matches[0].id },
        include: { bet: true, players: true },
      })
      expect(dbMatchAfter?.state).to.equal(EMatchState.FINISHED, "Match should remain FINISHED")
      expect(dbMatchAfter?.bet?.winnerAwarded).to.be.false, "Match should not be marked as awarded"
      expect(dbMatchAfter?.bet?.refunded).to.be.true, "Match should be marked as refunded"
      for (const player of dbMatchAfter?.players || []) {
        expect(player.satsReceived).to.equal(0, `Player ${player.name} should not receive sats`)
        expect(player.satsPaid).to.equal(0, `Player ${player.name} should have bets refunded`)
        expect(player.payRequestId).to.be.null
      }

      // Verify balances after reconciliation
      for (const [i] of clients.entries()) {
        const res = await apis[i].auth.getUserProfile({ headers: { Cookie: cookies[i] } })
        expect(res.data.wallet?.balanceInSats).to.equal(
          balances[i],
          `Player ${i} balance should be restored after refund`
        )
      }

      // Verify finished match is not deleted
      const table = server.tables.get(matchId)
      if (table) {
        await server.cleanupMatchTable(table)
        const remainingMatch = await prisma.match.findUnique({ where: { id: table.matchId } })
        expect(remainingMatch).to.not.be.null
        expect(remainingMatch?.state).to.equal(EMatchState.FINISHED)
      }
    })
  })
})
