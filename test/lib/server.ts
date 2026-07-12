import { io as Client, Socket } from "socket.io-client"
import { assert, expect } from "chai"
import {
  EMatchState,
  ESayCommand,
  ICard,
  IPublicMatch,
  IQueueMatchFound,
  IQueueMatchCancelled,
  IQueueMatchStarting,
  IQueueReadyUpdate,
} from "../../src/types"
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
import { Logger } from "pino"

describe("Socket Server", () => {
  let clients: Socket<ServerToClientEvents, ClientToServerEvents>[] = []
  let server: ITrucoshi

  const waitForQueueMatch = (
    client: Socket<ServerToClientEvents, ClientToServerEvents>,
    timeout = 12000
  ) =>
    new Promise<IQueueMatchFound>((resolve, reject) => {
      const timer = setTimeout(() => {
        client.off(EServerEvent.QUEUE_MATCH_FOUND, handleMatchFound)
        reject(new Error("Timed out waiting for queue match"))
      }, timeout)
      const handleMatchFound = (match: IQueueMatchFound) => {
        clearTimeout(timer)
        resolve(match)
      }
      client.once(EServerEvent.QUEUE_MATCH_FOUND, handleMatchFound)
    })

  const waitForQueueReadyUpdate = (
    client: Socket<ServerToClientEvents, ClientToServerEvents>,
    timeout = 7000
  ) =>
    new Promise<IQueueReadyUpdate>((resolve, reject) => {
      const timer = setTimeout(() => {
        client.off(EServerEvent.QUEUE_READY_UPDATE, handleReadyUpdate)
        reject(new Error("Timed out waiting for queue ready update"))
      }, timeout)
      const handleReadyUpdate = (update: IQueueReadyUpdate) => {
        clearTimeout(timer)
        resolve(update)
      }
      client.once(EServerEvent.QUEUE_READY_UPDATE, handleReadyUpdate)
    })

  const waitForQueueStarting = (
    client: Socket<ServerToClientEvents, ClientToServerEvents>,
    timeout = 7000
  ) =>
    new Promise<IQueueMatchStarting>((resolve, reject) => {
      const timer = setTimeout(() => {
        client.off(EServerEvent.QUEUE_MATCH_STARTING, handleStarting)
        reject(new Error("Timed out waiting for queue match starting"))
      }, timeout)
      const handleStarting = (starting: IQueueMatchStarting) => {
        clearTimeout(timer)
        resolve(starting)
      }
      client.once(EServerEvent.QUEUE_MATCH_STARTING, handleStarting)
    })

  const waitForQueueCancelled = (
    client: Socket<ServerToClientEvents, ClientToServerEvents>,
    timeout = 7000
  ) =>
    new Promise<IQueueMatchCancelled>((resolve, reject) => {
      const timer = setTimeout(() => {
        client.off(EServerEvent.QUEUE_MATCH_CANCELLED, handleCancelled)
        reject(new Error("Timed out waiting for queue match cancellation"))
      }, timeout)
      const handleCancelled = (cancelled: IQueueMatchCancelled) => {
        clearTimeout(timer)
        resolve(cancelled)
      }
      client.once(EServerEvent.QUEUE_MATCH_CANCELLED, handleCancelled)
    })

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

    it("should create a tutorial match with huge turn timers", async () => {
      const tutorialClient: Socket<ServerToClientEvents, ClientToServerEvents> = Client(
        `http://localhost:${process.env.APP_PORT || 9999}`,
        {
          withCredentials: true,
          auth: { name: "tutorial-player", session: "tutorial-player" },
        }
      )

      try {
        await new Promise<void>((resolve, reject) => {
          tutorialClient.emit(
            EClientEvent.CREATE_TUTORIAL_MATCH,
            null,
            ({ success, match, error }) => {
              if (!success || !match) {
                return reject(handleError(error, "Failed to create tutorial match"))
              }

              expect(match.tutorial?.id).to.equal("basic-truco-v1")
              expect(match.options.turnTime).to.equal(24 * 60 * 60 * 1000)
              expect(match.options.abandonTime).to.equal(24 * 60 * 60 * 1000)
              resolve()
            }
          )
        })
      } finally {
        tutorialClient.close()
      }
    })

    it("should match two queued humans", async () => {
      const player0Match = waitForQueueMatch(clients[0])
      const player1Match = waitForQueueMatch(clients[1])
      let player0QueuedAt = 0

      await new Promise<void>((resolve, reject) => {
        clients[0].emit(
          EClientEvent.JOIN_QUEUE,
          { maxPlayers: 2, allowBots: false },
          ({ success, status, error }) => {
            if (status?.queuedAt) {
              player0QueuedAt = status.queuedAt
            }
            if (success) return resolve()
            reject(handleError(error, "Player 0 failed to join queue"))
          }
        )
      })

      await new Promise<void>((resolve, reject) => {
        clients[1].emit(
          EClientEvent.JOIN_QUEUE,
          { maxPlayers: 2, allowBots: false },
          ({ success, error }) => {
            if (success) return resolve()
            reject(handleError(error, "Player 1 failed to join queue"))
          }
        )
      })

      const [match0, match1] = await Promise.all([player0Match, player1Match])
      expect(match0.matchSessionId).to.equal(match1.matchSessionId)
      expect(match0.maxPlayers).to.equal(2)
      expect(match0.humanPlayers).to.equal(2)
      expect(match0.botPlayers).to.equal(0)
      expect(match0.filledWithBots).to.equal(false)
      expect(match0.proposalId).to.be.a("string")
      expect(match0.readyExpiresAt).to.be.greaterThan(Date.now())
      expect(match0.participants).to.have.length(2)
      expect(match0.participants.every((participant) => !participant.ready)).to.equal(true)
      expect(player0QueuedAt).to.be.greaterThan(0)
      const player0Session = server.sessions.find((session) => session.name === "player0")?.session
      const player1Session = server.sessions.find((session) => session.name === "player1")?.session
      expect(server.tables.get(match0.matchSessionId)?.state()).to.equal(EMatchState.UNREADY)
      expect(
        server.tables.get(match0.matchSessionId)?.getPublicMatch(player0Session).queueOptions
      ).to.deep.equal({ maxPlayers: 2, allowBots: false })
      expect(
        server.tables.get(match1.matchSessionId)?.getPublicMatch(player1Session).queueOptions
      ).to.deep.equal({ maxPlayers: 2, allowBots: false })

      const player0Ready = waitForQueueReadyUpdate(clients[0])

      await new Promise<void>((resolve, reject) => {
        clients[0].emit(
          EClientEvent.CONFIRM_QUEUE_MATCH,
          match0.proposalId,
          ({ success, error }) => {
            if (success) return resolve()
            reject(handleError(error, "Player 0 failed to confirm queue match"))
          }
        )
      })

      const readyUpdate = await player0Ready
      expect(
        readyUpdate.participants.find((participant) => participant.session === player0Session)
          ?.ready
      ).to.equal(true)
      expect(server.tables.get(match0.matchSessionId)?.state()).to.equal(EMatchState.UNREADY)

      const player0Starting = waitForQueueStarting(clients[0])
      const player1Starting = waitForQueueStarting(clients[1])

      await new Promise<void>((resolve, reject) => {
        clients[1].emit(
          EClientEvent.CONFIRM_QUEUE_MATCH,
          match0.proposalId,
          ({ success, error }) => {
            if (success) return resolve()
            reject(handleError(error, "Player 1 failed to confirm queue match"))
          }
        )
      })

      const [starting0, starting1] = await Promise.all([player0Starting, player1Starting])
      expect(starting0.matchSessionId).to.equal(match0.matchSessionId)
      expect(starting1.matchSessionId).to.equal(match0.matchSessionId)
      expect(starting0.startsAt).to.be.greaterThan(Date.now())

      await new Promise((resolve) => setTimeout(resolve, 3500))
      expect(server.tables.get(match0.matchSessionId)?.state()).to.equal(EMatchState.STARTED)
      expect(server.getSessionActiveMatches(player0Session)[0]?.createdFromQueue).to.equal(true)
    })

    it("should fill a queued any-size match with a bot after fallback", async () => {
      const queuedMatch = waitForQueueMatch(clients[2])
      const starting = waitForQueueStarting(clients[2], 12000)

      await new Promise<void>((resolve, reject) => {
        clients[2].emit(
          EClientEvent.JOIN_QUEUE,
          { maxPlayers: 0, allowBots: true },
          ({ success, error }) => {
            if (success) return resolve()
            reject(handleError(error, "Player failed to join bot fallback queue"))
          }
        )
      })

      const match = await queuedMatch
      expect(match.maxPlayers).to.equal(2)
      expect(match.humanPlayers).to.equal(1)
      expect(match.botPlayers).to.equal(1)
      expect(match.filledWithBots).to.equal(true)
      const player2Session = server.sessions.find((session) => session.name === "player2")?.session
      expect(
        server.tables.get(match.matchSessionId)?.getPublicMatch(player2Session).queueOptions
      ).to.deep.equal({ maxPlayers: 0, allowBots: true })

      const startingEvent = await starting
      expect(startingEvent.matchSessionId).to.equal(match.matchSessionId)
      await new Promise((resolve) => setTimeout(resolve, 3500))
      expect(server.tables.get(match.matchSessionId)?.state()).to.equal(EMatchState.STARTED)
    })

    it("should cancel a queue proposal and requeue confirmed players when another player declines", async () => {
      const player2Match = waitForQueueMatch(clients[2])
      const player3Match = waitForQueueMatch(clients[3])

      await new Promise<void>((resolve, reject) => {
        clients[2].emit(
          EClientEvent.JOIN_QUEUE,
          { maxPlayers: 2, allowBots: false },
          ({ success, error }) => {
            if (success) return resolve()
            reject(handleError(error, "Player 2 failed to join cancellable queue"))
          }
        )
      })

      await new Promise<void>((resolve, reject) => {
        clients[3].emit(
          EClientEvent.JOIN_QUEUE,
          { maxPlayers: 2, allowBots: false },
          ({ success, error }) => {
            if (success) return resolve()
            reject(handleError(error, "Player 3 failed to join cancellable queue"))
          }
        )
      })

      const [match2, match3] = await Promise.all([player2Match, player3Match])
      expect(match2.matchSessionId).to.equal(match3.matchSessionId)

      await new Promise<void>((resolve, reject) => {
        clients[2].emit(
          EClientEvent.CONFIRM_QUEUE_MATCH,
          match2.proposalId,
          ({ success, error }) => {
            if (success) return resolve()
            reject(handleError(error, "Player 2 failed to confirm cancellable queue"))
          }
        )
      })

      const cancelled = waitForQueueCancelled(clients[2])
      await new Promise<void>((resolve, reject) => {
        clients[3].emit(
          EClientEvent.DECLINE_QUEUE_MATCH,
          match2.proposalId,
          ({ success, error }) => {
            if (success) return resolve()
            reject(handleError(error, "Player 3 failed to decline queue proposal"))
          }
        )
      })

      const cancellation = await cancelled
      expect(cancellation.matchSessionId).to.equal(match2.matchSessionId)
      expect(cancellation.reason).to.equal("declined")

      const player2Session = server.sessions.find((session) => session.name === "player2")
      const player3Session = server.sessions.find((session) => session.name === "player3")
      expect(
        server.matchQueue.find((entry) => entry.userSession.session === player2Session?.session)
      ).to.exist
      expect(
        server.matchQueue.find((entry) => entry.userSession.session === player3Session?.session)
      ).to.equal(undefined)

      await new Promise<void>((resolve, reject) => {
        clients[2].emit(EClientEvent.LEAVE_QUEUE, ({ success, error }) => {
          if (success) return resolve()
          reject(handleError(error, "Player 2 failed to leave requeued queue"))
        })
      })
    })

    it("should match mixed bot preference humans before bot fallback", async () => {
      const player2Match = waitForQueueMatch(clients[2])
      const player3Match = waitForQueueMatch(clients[3])

      await new Promise<void>((resolve, reject) => {
        clients[2].emit(
          EClientEvent.JOIN_QUEUE,
          { maxPlayers: 2, allowBots: true },
          ({ success, error }) => {
            if (success) return resolve()
            reject(handleError(error, "Player 2 failed to join mixed queue"))
          }
        )
      })

      await new Promise<void>((resolve, reject) => {
        clients[3].emit(
          EClientEvent.JOIN_QUEUE,
          { maxPlayers: 2, allowBots: false },
          ({ success, error }) => {
            if (success) return resolve()
            reject(handleError(error, "Player 3 failed to join mixed queue"))
          }
        )
      })

      const [match2, match3] = await Promise.all([player2Match, player3Match])
      expect(match2.matchSessionId).to.equal(match3.matchSessionId)
      expect(match2.maxPlayers).to.equal(2)
      expect(match2.humanPlayers).to.equal(2)
      expect(match2.botPlayers).to.equal(0)
      expect(match2.filledWithBots).to.equal(false)
    })

    it("should default queue size to any and match mixed bot preference humans", async () => {
      const player2Match = waitForQueueMatch(clients[2])
      const player3Match = waitForQueueMatch(clients[3])

      await new Promise<void>((resolve, reject) => {
        clients[2].emit(
          EClientEvent.JOIN_QUEUE,
          { allowBots: true } as any,
          ({ success, error }) => {
            if (success) return resolve()
            reject(handleError(error, "Player 2 failed to join default-size mixed queue"))
          }
        )
      })

      await new Promise<void>((resolve, reject) => {
        clients[3].emit(
          EClientEvent.JOIN_QUEUE,
          { allowBots: false } as any,
          ({ success, error }) => {
            if (success) return resolve()
            reject(handleError(error, "Player 3 failed to join default-size mixed queue"))
          }
        )
      })

      const [match2, match3] = await Promise.all([player2Match, player3Match])
      expect(match2.matchSessionId).to.equal(match3.matchSessionId)
      expect(match2.maxPlayers).to.equal(2)
      expect(match2.humanPlayers).to.equal(2)
      expect(match2.botPlayers).to.equal(0)
      expect(match2.filledWithBots).to.equal(false)
    })

    it("should restore an existing queue for another device on the same session", async () => {
      const sharedA = Client(`http://localhost:${process.env.APP_PORT || 9999}`, {
        autoConnect: false,
        withCredentials: true,
        auth: { name: "shared-a" },
      })

      await new Promise<void>((resolve, reject) => {
        sharedA.once("connect", resolve)
        sharedA.once("connect_error", reject)
        sharedA.connect()
      })

      const sharedSession = server.sessions.find((session) => session.name === "shared-a")?.session
      expect(sharedSession).to.be.a("string")

      const sharedB = Client(`http://localhost:${process.env.APP_PORT || 9999}`, {
        autoConnect: false,
        withCredentials: true,
        auth: { name: "shared-b", sessionID: sharedSession },
      })

      try {
        await new Promise<void>((resolve, reject) => {
          sharedB.once("connect", resolve)
          sharedB.once("connect_error", reject)
          sharedB.connect()
        })

        const sharedAMatch = waitForQueueMatch(
          sharedA as Socket<ServerToClientEvents, ClientToServerEvents>
        )
        const sharedBMatch = waitForQueueMatch(
          sharedB as Socket<ServerToClientEvents, ClientToServerEvents>
        )
        const opponentMatch = waitForQueueMatch(clients[0])
        let firstQueuedAt = 0
        let restoredQueueStatus: Awaited<ReturnType<typeof server.fetchQueueStatus>>

        await new Promise<void>((resolve, reject) => {
          sharedA.emit(
            EClientEvent.JOIN_QUEUE,
            { maxPlayers: 2, allowBots: true },
            ({ success, status, error }) => {
              firstQueuedAt = status?.queuedAt || 0
              if (success) return resolve()
              reject(handleError(error, "Shared device A failed to join queue"))
            }
          )
        })

        await new Promise<void>((resolve, reject) => {
          sharedB.emit(EClientEvent.FETCH_QUEUE_STATUS, ({ success, status, error }) => {
            restoredQueueStatus = status
            if (success) return resolve()
            reject(handleError(error, "Shared device B failed to restore its queue"))
          })
        })

        expect(restoredQueueStatus?.queuedAt).to.equal(firstQueuedAt)
        expect(restoredQueueStatus?.maxPlayers).to.equal(2)
        expect(restoredQueueStatus?.allowBots).to.equal(true)

        const sharedBQueueLeft = new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            sharedB.off(EServerEvent.QUEUE_UPDATE, handleQueueUpdate)
            reject(new Error("Timed out waiting for shared device queue leave update"))
          }, 7000)
          const handleQueueUpdate = (
            status: Awaited<ReturnType<typeof server.fetchQueueStatus>> | null
          ) => {
            if (status) return
            clearTimeout(timer)
            sharedB.off(EServerEvent.QUEUE_UPDATE, handleQueueUpdate)
            resolve()
          }
          sharedB.on(EServerEvent.QUEUE_UPDATE, handleQueueUpdate)
        })

        await new Promise<void>((resolve, reject) => {
          sharedA.emit(EClientEvent.LEAVE_QUEUE, ({ success, error }) => {
            if (success) return resolve()
            reject(handleError(error, "Shared device A failed to leave queue"))
          })
        })
        await sharedBQueueLeft

        await new Promise<void>((resolve, reject) => {
          sharedA.emit(
            EClientEvent.JOIN_QUEUE,
            { maxPlayers: 2, allowBots: true },
            ({ success, error }) => {
              if (success) return resolve()
              reject(handleError(error, "Shared device A failed to rejoin queue"))
            }
          )
        })

        await new Promise<void>((resolve, reject) => {
          clients[0].emit(
            EClientEvent.JOIN_QUEUE,
            { maxPlayers: 2, allowBots: false },
            ({ success, error }) => {
              if (success) return resolve()
              reject(handleError(error, "Opponent failed to join shared-session queue"))
            }
          )
        })

        const [matchA, matchB, matchOpponent] = await Promise.all([
          sharedAMatch,
          sharedBMatch,
          opponentMatch,
        ])
        expect(matchA.matchSessionId).to.equal(matchB.matchSessionId)
        expect(matchA.matchSessionId).to.equal(matchOpponent.matchSessionId)
        expect(matchA.humanPlayers).to.equal(2)
        expect(matchA.botPlayers).to.equal(0)
      } finally {
        sharedA.close()
        sharedB.close()
      }
    })

    it("should prioritize a waiting humans-only player before bot fallback", async () => {
      const humanOnlyMatch = waitForQueueMatch(clients[2])
      const botAllowedMatch = waitForQueueMatch(clients[3])

      await new Promise<void>((resolve, reject) => {
        clients[2].emit(
          EClientEvent.JOIN_QUEUE,
          { maxPlayers: 2, allowBots: false },
          ({ success, error }) => {
            if (success) return resolve()
            reject(handleError(error, "Humans-only player failed to join queue"))
          }
        )
      })

      await new Promise<void>((resolve, reject) => {
        clients[3].emit(
          EClientEvent.JOIN_QUEUE,
          { maxPlayers: 2, allowBots: true },
          ({ success, error }) => {
            if (success) return resolve()
            reject(handleError(error, "Bot-allowed player failed to join queue"))
          }
        )
      })

      const [matchHumanOnly, matchBotAllowed] = await Promise.all([humanOnlyMatch, botAllowedMatch])
      expect(matchHumanOnly.matchSessionId).to.equal(matchBotAllowed.matchSessionId)
      expect(matchHumanOnly.maxPlayers).to.equal(2)
      expect(matchHumanOnly.humanPlayers).to.equal(2)
      expect(matchHumanOnly.botPlayers).to.equal(0)
      expect(matchHumanOnly.filledWithBots).to.equal(false)
    })

    it("should keep waiting when bot fallback is disabled", async () => {
      let matched = false
      clients[3].once(EServerEvent.QUEUE_MATCH_FOUND, () => {
        matched = true
      })

      await new Promise<void>((resolve, reject) => {
        clients[3].emit(
          EClientEvent.JOIN_QUEUE,
          { maxPlayers: 2, allowBots: false },
          ({ success, error }) => {
            if (success) return resolve()
            reject(handleError(error, "Player failed to join humans-only queue"))
          }
        )
      })

      await new Promise((resolve) => setTimeout(resolve, 5500))
      expect(matched).to.equal(false)

      await new Promise<void>((resolve, reject) => {
        clients[3].emit(EClientEvent.LEAVE_QUEUE, ({ success, error }) => {
          if (success) return resolve()
          reject(handleError(error, "Player failed to leave humans-only queue"))
        })
      })
    })

    it("should fill a partial 2v2 queue with bots after fallback", async () => {
      const player4Match = waitForQueueMatch(clients[4])
      const player5Match = waitForQueueMatch(clients[5])

      await new Promise<void>((resolve, reject) => {
        clients[4].emit(
          EClientEvent.JOIN_QUEUE,
          { maxPlayers: 4, allowBots: true },
          ({ success, error }) => {
            if (success) return resolve()
            reject(handleError(error, "Player 4 failed to join partial queue"))
          }
        )
      })
      await new Promise<void>((resolve, reject) => {
        clients[5].emit(
          EClientEvent.JOIN_QUEUE,
          { maxPlayers: 4, allowBots: true },
          ({ success, error }) => {
            if (success) return resolve()
            reject(handleError(error, "Player 5 failed to join partial queue"))
          }
        )
      })

      const [match4, match5] = await Promise.all([player4Match, player5Match])
      expect(match4.matchSessionId).to.equal(match5.matchSessionId)
      expect(match4.maxPlayers).to.equal(4)
      expect(server.tables.get(match4.matchSessionId)?.lobby.options.matchPoint).to.equal(12)
      expect(match4.humanPlayers).to.equal(2)
      expect(match4.botPlayers).to.equal(2)
      expect(match4.filledWithBots).to.equal(true)
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
        clients[0].emit(EClientEvent.CREATE_MATCH, ({ match, activeMatches }) => {
          expect(Boolean(match?.matchSessionId)).to.equal(true)
          expect(match?.createdFromQueue).to.equal(false)
          expect(match?.queueOptions).to.equal(undefined)
          expect(
            activeMatches?.find(
              (activeMatch) => activeMatch.matchSessionId === match?.matchSessionId
            )?.createdFromQueue
          ).to.equal(false)
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

    it("should play 100 matches with lots of flowers and 5 bots", (done) => {
      const previousCheatFlowers = process.env.APP_CHEAT_LOTS_OF_FLOWERS_FOR_TESTING
      process.env.APP_CHEAT_LOTS_OF_FLOWERS_FOR_TESTING = "1"

      const promises: Array<() => Promise<void>> = []
      for (let i = 0; i < 100; i++) {
        promises.push(() => playBotsMatch([clients[0]], 5))
      }

      Promise.all(promises.map((p) => p()))
        .then(() => done())
        .catch((e) => {
          done(e)
        })

      process.env.APP_CHEAT_LOTS_OF_FLOWERS_FOR_TESTING = previousCheatFlowers
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
      fatal: sinon.stub().callsFake(() => {}),
      silent: sinon.stub().callsFake(() => {}),
    }

    before(() => {
      warnStub = sinon.stub(logger, "warn").callsFake(() => {})
      errorStub = sinon.stub(logger, "error").callsFake(() => {})
      childStub = sinon.stub(logger, "child").callsFake(() => {
        return childLogger as unknown as Logger<string, boolean>
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
