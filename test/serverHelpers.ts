import { expect } from "chai"
import { ICard, IPublicMatch } from "../src/types"
import { Socket } from "socket.io-client"
import {
  ClientToServerEvents,
  EClientEvent,
  EServerEvent,
  ServerToClientEvents,
} from "../src/events"
import { EMatchState } from "@prisma/client"
import { getOpponentTeam } from "../src/lib/utils"

const MATCH_TIMEOUT_MS = Number(process.env.TEST_MATCH_TIMEOUT_MS || 45000)

type TrucoshiClient = Socket<ServerToClientEvents, ClientToServerEvents>
type Cleanup = () => void

const summarizeMatch = (match: IPublicMatch | undefined, clientIdx: number) => {
  if (!match) {
    return { clientIdx, observed: false }
  }

  return {
    clientIdx,
    observed: true,
    matchSessionId: match.matchSessionId,
    state: match.state,
    handState: match.handState,
    winner: match.winner
      ? {
          id: match.winner.id,
          points: match.winner.points,
        }
      : null,
    players: match.players.map((player) => ({
      name: player.name,
      idx: player.idx,
      teamIdx: player.teamIdx,
      bot: player.bot,
      abandoned: player.abandoned,
      disabled: player.disabled,
      ready: player.ready,
    })),
    teams: match.teams.map((team) => ({
      idx: team.idx,
      players: team.players.map((player) => ({
        name: player.name,
        bot: player.bot,
        abandoned: player.abandoned,
        disabled: player.disabled,
      })),
    })),
  }
}

const matchError = (
  message: string,
  phase: string,
  matchId: string | undefined,
  matches: IPublicMatch[]
) =>
  new Error(
    `${message}\n${JSON.stringify(
      {
        phase,
        matchId,
        matches: matches.map((match, clientIdx) => summarizeMatch(match, clientIdx)),
      },
      null,
      2
    )}`
  )

const withTimeout = <T>(
  promise: Promise<T>,
  phase: string,
  matchId: string | undefined,
  matches: IPublicMatch[]
) =>
  new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(matchError(`Timed out waiting for ${phase}`, phase, matchId, matches))
    }, MATCH_TIMEOUT_MS)

    promise.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        clearTimeout(timeout)
        reject(error)
      }
    )
  })

const addListener = <Event extends keyof ServerToClientEvents>(
  cleanups: Cleanup[],
  client: TrucoshiClient,
  event: Event,
  handler: ServerToClientEvents[Event]
) => {
  client.on(event, handler)
  cleanups.push(() => client.off(event, handler))
}

const assertMatch = (
  match: IPublicMatch | undefined,
  expectedMatchId: string | undefined,
  phase: string,
  matches: IPublicMatch[]
) => {
  if (!match || match.matchSessionId !== expectedMatchId) {
    throw matchError("Unexpected match response", phase, expectedMatchId, matches)
  }
}

export const playRandomMatch = async (
  clients: Socket<ServerToClientEvents, ClientToServerEvents>[]
) => {
  let matchId: string | undefined
  const matches: IPublicMatch[] = []
  const cleanups: Cleanup[] = []
  let resolveWinner: () => void = () => {}
  let rejectWinner: (error: Error) => void = () => {}
  const winnerPromise = new Promise<void>((resolve, reject) => {
    resolveWinner = resolve
    rejectWinner = reject
  })
  const isOwnMatch = (match?: IPublicMatch) => Boolean(matchId && match?.matchSessionId === matchId)

  try {
    matchId = await withTimeout(
      new Promise<string>((resolve, reject) => {
        clients[0].emit(EClientEvent.CREATE_MATCH, ({ match }) => {
          try {
            expect(Boolean(match?.matchSessionId)).to.equal(true)
            if (!match?.matchSessionId) {
              return reject(matchError("Match not found on create", "create", matchId, matches))
            }
            matches[0] = match
            resolve(match.matchSessionId)
          } catch (error) {
            reject(error)
          }
        })
      }),
      "create",
      matchId,
      matches
    )

    clients.forEach((client, clientIdx) => {
      addListener(cleanups, client, EServerEvent.WAITING_PLAY, (match, callback) => {
        if (!isOwnMatch(match)) {
          return
        }
        matches[clientIdx] = match

        if (!match.me?.hand?.length) {
          rejectWinner(matchError("Player has no playable hand", "waiting-play", matchId, matches))
          return
        }

        const cardIdx = Math.floor(Math.random() * match.me.hand.length)
        callback({ card: match.me.hand[cardIdx] as ICard, cardIdx })
      })

      addListener(cleanups, client, EServerEvent.UPDATE_MATCH, (match) => {
        if (!isOwnMatch(match)) {
          return
        }
        matches[clientIdx] = match

        if (clientIdx !== 0) {
          return
        }

        if (match.winner) {
          resolveWinner()
        } else if (match.state === EMatchState.FINISHED) {
          rejectWinner(
            matchError("Match finished without a winner", "update-match", matchId, matches)
          )
        }
      })
    })

    await withTimeout(
      new Promise<void>((resolve, reject) => {
        clients[0].emit(EClientEvent.SET_MATCH_OPTIONS, matchId, { flor: false }, ({ success }) => {
          if (success) {
            return resolve()
          }
          reject(matchError("Failed to set match options", "set-options", matchId, matches))
        })
      }),
      "set-options",
      matchId,
      matches
    )

    const joinPromises = clients.map((client, clientIdx) => {
      const sendReady = () =>
        withTimeout(
          new Promise<void>((resolve, reject) => {
            client.emit(EClientEvent.SET_PLAYER_READY, matchId, true, ({ success, match }) => {
              try {
                assertMatch(match, matchId, "ready", matches)
                matches[clientIdx] = match
                expect(success).to.equal(true)
                resolve()
              } catch (error) {
                reject(error)
              }
            })
          }),
          "ready",
          matchId,
          matches
        )

      if (clientIdx === 0) {
        return () => sendReady()
      }

      return (teamIdx: 0 | 1) =>
        withTimeout(
          new Promise<void>((resolve, reject) => {
            client.emit(EClientEvent.JOIN_MATCH, matchId as string, teamIdx, ({ success, match }) => {
              try {
                assertMatch(match, matchId, "join", matches)
                expect(success).to.equal(true)
                expect(Boolean(match.players.find((player) => player.name === "player" + clientIdx))).to.equal(
                  true
                )
                matches[clientIdx] = match
                sendReady().then(resolve, reject)
              } catch (error) {
                reject(error)
              }
            })
          }),
          "join",
          matchId,
          matches
        )
    })

    let teamIdx: 0 | 1 = 0
    for (const joinPromise of joinPromises) {
      await joinPromise(teamIdx)
      teamIdx = getOpponentTeam(teamIdx) as 0 | 1
    }

    await withTimeout(
      new Promise<void>((resolve, reject) => {
        clients[0].emit(EClientEvent.START_MATCH, matchId, ({ success, matchSessionId }) => {
          try {
            expect(success).to.equal(true)
            expect(matchSessionId).to.equal(matchId)
            resolve()
          } catch (error) {
            reject(error)
          }
        })
      }),
      "start",
      matchId,
      matches
    )

    await withTimeout(winnerPromise, "winner", matchId, matches)

    expect(matches[0]?.winner?.points.buenas).to.be.greaterThanOrEqual(9)
  } finally {
    cleanups.forEach((cleanup) => cleanup())
  }
}

export const playBotsMatch = async (
  clients: Socket<ServerToClientEvents, ClientToServerEvents>[],
  bots: number
) => {
  let matchId: string | undefined
  const matches: IPublicMatch[] = []
  const cleanups: Cleanup[] = []
  let resolveWinner: () => void = () => {}
  let rejectWinner: (error: Error) => void = () => {}
  const winnerPromise = new Promise<void>((resolve, reject) => {
    resolveWinner = resolve
    rejectWinner = reject
  })
  const isOwnMatch = (match?: IPublicMatch) => Boolean(matchId && match?.matchSessionId === matchId)

  try {
    matchId = await withTimeout(
      new Promise<string>((resolve, reject) => {
        clients[0].emit(EClientEvent.CREATE_MATCH, ({ match }) => {
          try {
            expect(Boolean(match?.matchSessionId)).to.equal(true)
            if (!match?.matchSessionId) {
              return reject(matchError("Match not found on create", "create", matchId, matches))
            }
            matches[0] = match
            resolve(match.matchSessionId)
          } catch (error) {
            reject(error)
          }
        })
      }),
      "create",
      matchId,
      matches
    )

    clients.forEach((client, clientIdx) => {
      addListener(cleanups, client, EServerEvent.WAITING_PLAY, (match) => {
        if (!isOwnMatch(match)) {
          return
        }
        matches[clientIdx] = match

        if (!match.me?.hand?.length) {
          rejectWinner(matchError("Player has no playable hand", "waiting-play", matchId, matches))
          return
        }

        client.emit(EClientEvent.LEAVE_MATCH, match.matchSessionId)
      })

      addListener(cleanups, client, EServerEvent.UPDATE_MATCH, (match) => {
        if (!isOwnMatch(match)) {
          return
        }
        matches[clientIdx] = match

        if (clientIdx !== 0) {
          return
        }

        if (match.winner) {
          resolveWinner()
        } else if (match.state === EMatchState.FINISHED) {
          rejectWinner(
            matchError("Match finished without a winner", "update-match", matchId, matches)
          )
        }
      })
    })

    await withTimeout(
      new Promise<void>((resolve, reject) => {
        clients[0].emit(
          EClientEvent.SET_MATCH_OPTIONS,
          matchId,
          { flor: Math.random() > 0.5 },
          ({ success }) => {
            if (success) {
              return resolve()
            }
            reject(matchError("Failed to set match options", "set-options", matchId, matches))
          }
        )
      }),
      "set-options",
      matchId,
      matches
    )

    for (let botIdx = 0; botIdx < bots; botIdx++) {
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          clients[0].emit(EClientEvent.ADD_BOT, matchId as string, undefined, ({ success }) => {
            if (success) {
              return resolve()
            }
            reject(matchError(`Failed to add bot ${botIdx}`, "add-bot", matchId, matches))
          })
        }),
        "add-bot",
        matchId,
        matches
      )
    }

    const joinPromises = clients.map((client, clientIdx) => {
      const sendReady = () =>
        withTimeout(
          new Promise<void>((resolve, reject) => {
            client.emit(EClientEvent.SET_PLAYER_READY, matchId, true, ({ success, match }) => {
              try {
                assertMatch(match, matchId, "ready", matches)
                matches[clientIdx] = match
                expect(success).to.equal(true)
                resolve()
              } catch (error) {
                reject(error)
              }
            })
          }),
          "ready",
          matchId,
          matches
        )

      if (clientIdx === 0) {
        return () => sendReady()
      }

      return (teamIdx: 0 | 1) =>
        withTimeout(
          new Promise<void>((resolve, reject) => {
            client.emit(EClientEvent.JOIN_MATCH, matchId as string, teamIdx, ({ success, match }) => {
              try {
                assertMatch(match, matchId, "join", matches)
                expect(success).to.equal(true)
                expect(Boolean(match.players.find((player) => player.name === "player" + clientIdx))).to.equal(
                  true
                )
                matches[clientIdx] = match
                sendReady().then(resolve, reject)
              } catch (error) {
                reject(error)
              }
            })
          }),
          "join",
          matchId,
          matches
        )
    })

    let teamIdx: 0 | 1 = 0
    for (const joinPromise of joinPromises) {
      await joinPromise(teamIdx)
      teamIdx = getOpponentTeam(teamIdx) as 0 | 1
    }

    await withTimeout(
      new Promise<void>((resolve, reject) => {
        clients[0].emit(EClientEvent.START_MATCH, matchId, ({ success, matchSessionId }) => {
          try {
            expect(success).to.equal(true)
            expect(matchSessionId).to.equal(matchId)
            resolve()
          } catch (error) {
            reject(error)
          }
        })
      }),
      "start",
      matchId,
      matches
    )

    await withTimeout(winnerPromise, "winner", matchId, matches)

    if (matches[0]?.teams.some((team) => team.players.every((player) => player.abandoned))) {
      expect(matches[0].winner?.points.buenas).to.be.lessThan(9)
      return
    }

    expect(matches[0]?.winner?.points.buenas).to.be.greaterThanOrEqual(9)
  } finally {
    cleanups.forEach((cleanup) => cleanup())
  }
}
