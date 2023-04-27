import { randomUUID } from "crypto"
import { createServer, Server as HttpServer } from "http"
import { Server, Socket } from "socket.io"
import { IHand, IPlayInstance } from "../../lib"
import {
  ClientToServerEvents,
  EAnswerCommand,
  ECommand,
  EEnvidoAnswerCommand,
  EHandState,
  EMatchTableState,
  ESayCommand,
  EServerEvent,
  ICard,
  IEventCallback,
  IPlayedCard,
  IPlayer,
  IPublicMatch,
  IPublicMatchInfo,
  IPublicPlayer,
  ITeam,
  IWaitingPlayData,
  ServerToClientEvents,
  TMap,
} from "../../types"
import {
  PLAYER_ABANDON_TIMEOUT,
  PLAYER_TIMEOUT_GRACE,
  PLAYER_TURN_TIMEOUT,
  PREVIOUS_HAND_ACK_TIMEOUT,
} from "../constants"
import { Chat, IChat } from "./Chat"
import { IMatchTable } from "./MatchTable"
import { IUser, ISocketMatchState, User } from "./User"
import logger from "../../etc/logger"

interface ITrucoshiTurn {
  play: IPlayInstance
  timeout: NodeJS.Timeout
  resolve(): void
}

interface MatchTableMap extends TMap<string, IMatchTable> {
  getAll(filters: { state?: Array<EMatchTableState> }): Array<IPublicMatchInfo>
}

class MatchTableMap extends TMap<string, IMatchTable> {
  getAll(filters: { state?: Array<EMatchTableState> } = {}) {
    let results: Array<IPublicMatchInfo> = []

    for (let value of this.values()) {
      if (!filters.state || !filters.state.length || filters.state.includes(value.state())) {
        results.push(value.getPublicMatchInfo())
      }
    }

    return results
  }
}

interface InterServerEvents {}

interface SocketData {
  user?: IUser
  matches: TMap<string, ISocketMatchState>
}

export type TrucoshiServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>

export type TrucoshiSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>

export interface ITrucoshi {
  io: TrucoshiServer
  httpServer: HttpServer
  chat: IChat
  users: TMap<string, IUser> // sessionId, user
  tables: MatchTableMap // sessionId, table
  turns: TMap<string, ITrucoshiTurn> // sessionId, play instance
  getTableSockets(
    table: IMatchTable,
    callback?: (playerSocket: TrucoshiSocket, player: IPlayer | null) => Promise<void>
  ): Promise<{ sockets: any[]; players: IPublicPlayer[]; spectators: any[] }>
  getSessionActiveMatches(session?: string): IPublicMatchInfo[]
  setOrGetSession(
    socket: TrucoshiSocket,
    id: string | null,
    session: string | null,
    callback: IEventCallback<{
      session?: string
      serverVersion: string
    }>
  ): Promise<IUser>
  leaveMatch(matchId: string, socketId: string): Promise<void>
  emitWaitingPossibleSay(
    play: IPlayInstance,
    table: IMatchTable,
    isNewHand?: boolean
  ): Promise<ECommand | number>
  emitWaitingForPlay(play: IPlayInstance, table: IMatchTable, isNewHand?: boolean): Promise<void>
  emitMatchUpdate(table: IMatchTable, skipSocketIds?: Array<string>): Promise<void>
  emitPreviousHand(hand: IHand, table: IMatchTable): Promise<void>
  emitSocketMatch(socket: TrucoshiSocket, currentMatchId: string | null): IPublicMatch | null
  playCard(
    table: IMatchTable,
    play: IPlayInstance,
    player: IPlayer,
    cardIdx: number,
    card: ICard
  ): Promise<void>
  sayCommand(
    table: IMatchTable,
    play: IPlayInstance,
    player: IPlayer,
    command: ECommand | number
  ): Promise<ECommand | number>
  startMatch(matchSessionId: string): Promise<void>
  setTurnTimeout(
    table: IMatchTable,
    player: IPlayer,
    user: IUser,
    retry: () => void,
    cancel: () => void
  ): NodeJS.Timeout
  onHandFinished(table: IMatchTable, hand: IHand | null): Promise<void>
  onTurn(table: IMatchTable, play: IPlayInstance): Promise<void>
  onTruco(table: IMatchTable, play: IPlayInstance): Promise<void>
  onEnvido(table: IMatchTable, play: IPlayInstance, isPointsRounds: boolean): Promise<void>
  onWinner(table: IMatchTable, winner: ITeam): Promise<void>
  cleanupMatchTable(table: IMatchTable): void
  resetSocketsMatchState(table: IMatchTable): Promise<void>
  listen: (callback: (io: TrucoshiServer) => void) => void
}

export const Trucoshi = ({
  port,
  origin,
  serverVersion,
}: {
  port: number
  origin?: string | Array<string>
  serverVersion: string
}) => {
  const httpServer = createServer()

  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      cors: {
        origin,
        methods: ["GET", "POST"],
      },
    }
  )

  const users = new TMap<string, IUser>() // sessionId, user
  const tables = new MatchTableMap() // sessionId, table
  const turns = new TMap<string, ITrucoshiTurn>() // sessionId, play instance, play promise resolve and type

  const server: ITrucoshi = {
    users,
    tables,
    turns,
    io,
    httpServer,
    chat: Chat(io),
    listen(callback) {
      httpServer.listen(port, undefined, undefined, () => callback(server.io))
    },
    getSessionActiveMatches(session) {
      if (!session) {
        return []
      }
      return server.tables
        .findAll((table) => {
          if (table.state() === EMatchTableState.FINISHED) {
            return false
          }
          return Boolean(table.isSessionPlaying(session))
        })
        .map((match) => match.getPublicMatchInfo())
    },
    async setOrGetSession(socket, id, session, callback = () => {}) {
      if (session) {
        const user = server.users.get(session)
        if (user) {
          const newId = id || user.id || "Satoshi"
          user.connect()
          user.setId(newId)
          socket.data.user = user
          socket.data.matches = new TMap()
          callback({ success: true, serverVersion, session })
          return user
        }
      }

      const newSession = randomUUID()
      const userKey = randomUUID()
      const newId = id || "Satoshi"
      const newUser = User(userKey, newId, newSession)
      socket.data.user = newUser
      socket.data.matches = new TMap()
      server.users.set(newSession, newUser)
      callback({ success: false, serverVersion, session: newSession })
      return newUser
    },
    async getTableSockets(table, callback) {
      logger.trace(table.getPublicMatchInfo(), "Waiting for match player sockets...")

      const allSockets = await server.io.sockets.adapter.fetchSockets({
        rooms: new Set([table.matchSessionId]),
      })

      const players: IPublicPlayer[] = []
      const playerSockets: any[] = []
      const spectatorSockets: any[] = []

      for (const playerSocket of allSockets) {
        if (!playerSocket.data.user?.session) {
          spectatorSockets.push(playerSocket)
          // don't await for spectators
          callback?.(playerSocket, null)
          continue
        }

        const player = table.isSessionPlaying(playerSocket.data.user.session)

        if (player) {
          players.push(player.getPublicPlayer(playerSocket.data.user.session))
          playerSockets.push(playerSocket)
        } else {
          spectatorSockets.push(playerSocket)
        }

        if (callback) {
          await callback(playerSocket, player)
        }
      }

      return { sockets: playerSockets, spectators: spectatorSockets, players }
    },
    async emitMatchUpdate(table, skipSocketIds = []) {
      logger.trace(table.getPublicMatchInfo(), "Emitting match update to all sockets")
      await server.getTableSockets(table, async (playerSocket, player) => {
        if (skipSocketIds.includes(playerSocket.id) || !playerSocket.data.user) {
          return
        }
        playerSocket.emit(
          EServerEvent.UPDATE_MATCH,
          table.getPublicMatch(player ? (playerSocket.data.user.session as string) : undefined)
        )
      })
    },
    async emitWaitingPossibleSay(play, table, isNewHand = false) {
      logger.debug(table.getPublicMatchInfo(), "Emitting match possible players say")
      return new Promise<ECommand | number>((resolve, reject) => {
        return server
          .getTableSockets(table, async (playerSocket, player) => {
            if (!player) {
              playerSocket.emit(EServerEvent.UPDATE_MATCH, table.getPublicMatch())
              return
            }

            if (!playerSocket.data.matches) {
              logger.error(Error("Player socket doesn't have data.matches!!!"))
              return
            }

            if (playerSocket.data.matches.get(table.matchSessionId)?.isWaitingForSay) {
              return
            }

            logger.trace(
              { match: table.getPublicMatchInfo(), player: player.getPublicPlayer() },
              "Emitting waiting possible say to a player"
            )

            playerSocket.emit(
              EServerEvent.WAITING_POSSIBLE_SAY,
              table.getPublicMatch(player.session, isNewHand),
              (data) => {
                if (!data) {
                  return
                }
                if (!play.waitingPlay) {
                  logger.trace(
                    { match: table.getPublicMatchInfo(), player: player.getPublicPlayer() },
                    "Tried to say something but someone said something already"
                  )
                  return
                }
                const { command } = data
                server
                  .sayCommand(table, play, player, command)
                  .then((command) => {
                    resolve(command)
                    server.users.getOrThrow(player.session).reconnect(table.matchSessionId)
                  })
                  .catch(reject)
              }
            )
          })
          .catch(console.error)
      })
    },
    async emitWaitingForPlay(play, table, isNewHand) {
      return new Promise<void>((resolve, reject) => {
        server
          .emitWaitingPossibleSay(play, table, isNewHand)
          .then(() => {
            play.setWaiting(false)
            resolve()
          })
          .catch(logger.error)
        return server
          .getTableSockets(table, async (playerSocket, player) => {
            if (!player) {
              return
            }

            if (!playerSocket.data.matches) {
              logger.error(new Error("Player socket doesn't have data.matches!"))
              return
            }

            if (playerSocket.data.matches.get(table.matchSessionId)?.isWaitingForPlay) {
              return
            }

            if (player.session === play.player?.session) {
              logger.debug(
                { match: table.getPublicMatchInfo(), player: player.getPublicPlayer() },
                "Emitting waiting play to a player"
              )
              playerSocket.emit(
                EServerEvent.WAITING_PLAY,
                table.getPublicMatch(player.session),
                (data: IWaitingPlayData) => {
                  if (!data) {
                    return reject(new Error(EServerEvent.WAITING_PLAY + " callback returned empty"))
                  }
                  if (!play.waitingPlay) {
                    logger.trace(
                      { match: table.getPublicMatchInfo(), player: player.getPublicPlayer() },
                      "Tried to play a card but play is not waiting a play"
                    )
                    return
                  }
                  const { cardIdx, card } = data
                  server
                    .playCard(table, play, player, cardIdx, card)
                    .then(() => {
                      resolve()
                      server.users.getOrThrow(player.session).reconnect(table.matchSessionId)
                    })
                    .catch(reject)
                }
              )
            }
          })
          .catch(console.error)
      })
    },
    sayCommand(table, play, player, command) {
      return new Promise<ECommand | number>((resolve, reject) => {
        if (command || command === 0) {
          const saidCommand = play.say(command, player)
          if (saidCommand || saidCommand === 0) {
            clearTimeout(server.turns.getOrThrow(table.matchSessionId).timeout)
            play.setWaiting(false)

            server.chat.rooms
              .getOrThrow(table.matchSessionId)
              .command(player.teamIdx as 0 | 1, saidCommand)

            return server
              .resetSocketsMatchState(table)
              .then(() => resolve(saidCommand))
              .catch(reject)
          }
          return reject(new Error("Invalid Command"))
        }
        return reject(new Error("Undefined Command"))
      })
    },
    playCard(table, play, player, cardIdx, card) {
      return new Promise<void>((resolve, reject) => {
        if (cardIdx !== undefined && card) {
          const playedCard = play.use(cardIdx, card)
          if (playedCard) {
            clearTimeout(server.turns.getOrThrow(table.matchSessionId).timeout)

            server.chat.rooms.getOrThrow(table.matchSessionId).card(player, playedCard)
            return server.resetSocketsMatchState(table).then(resolve).catch(reject)
          }
          return reject(new Error("Invalid Card"))
        }
        return reject(new Error("Undefined Card"))
      })
    },
    async resetSocketsMatchState(table) {
      await server.getTableSockets(table, async (playerSocket) => {
        if (!playerSocket.data.matches) {
          return logger.error(new Error("Player socket doesn't have data.matches!!!"))
        }
        playerSocket.data.matches.set(table.matchSessionId, {
          isWaitingForPlay: false,
          isWaitingForSay: false,
        })
      })
    },
    async emitPreviousHand(hand, table) {
      logger.debug(table.getPublicMatchInfo(), "Emitting previous hand to players")

      const previousHand = table.getPreviousHand(hand)

      const promises: Array<PromiseLike<void>> = []
      await server.getTableSockets(table, async (playerSocket, player) => {
        promises.push(
          new Promise<void>((resolvePlayer, rejectPlayer) => {
            if (!player || !hand) {
              return rejectPlayer()
            }
            playerSocket.emit(EServerEvent.PREVIOUS_HAND, previousHand, resolvePlayer)
            setTimeout(rejectPlayer, PREVIOUS_HAND_ACK_TIMEOUT)
          }).catch(console.error)
        )
      })

      table.lobby.teams.map((team) => {
        server.chat.rooms
          .getOrThrow(table.matchSessionId)
          .system(`${team.name}: +${previousHand.points[team.id]}`)
      })

      logger.trace(
        table.getPublicMatchInfo(),
        "Previous hand timeout has finished, all players settled for next hand"
      )
      await Promise.allSettled(promises)
    },
    setTurnTimeout(table, player, user, onReconnection, onTimeout) {
      logger.trace({ player, PLAYER_TURN_TIMEOUT, PLAYER_ABANDON_TIMEOUT }, "Setting turn timeout")
      player.setTurnExpiration(PLAYER_TURN_TIMEOUT, PLAYER_ABANDON_TIMEOUT)

      const update = () => server.emitMatchUpdate(table).catch(logger.error)

      return setTimeout(() => {
        logger.trace(
          { match: table.getPublicMatchInfo(), player: player.getPublicPlayer() },
          "TURN TIMED OUT!"
        )

        table.playerDisconnected(player)
        update()

        user
          .waitReconnection(table.matchSessionId)
          .then(() => {
            table.playerReconnected(player)
            onReconnection()
          })
          .catch(() => {
            table.playerAbandoned(player)
            onTimeout()
          })
          .finally(update)
      }, PLAYER_TURN_TIMEOUT + PLAYER_TIMEOUT_GRACE)
    },
    onTurn(table, play) {
      return new Promise<void>((resolve, reject) => {
        const session = play.player?.session as string
        if (!session || !play || !play.player) {
          throw new Error("No session, play instance or player found")
        }

        const player = play.player
        const user = server.users.getOrThrow(session)

        server
          .emitWaitingForPlay(play, table)
          .then(resolve)
          .catch((e) => {
            logger.error(e, "ONTURN CALLBACK ERROR")
            reject(e)
          })

        const timeout = server.setTurnTimeout(
          table,
          player,
          user,
          () => server.onTurn(table, play).then(resolve).catch(reject),
          () =>
            server
              .sayCommand(table, play, player, ESayCommand.MAZO)
              .catch(logger.error)
              .finally(reject)
        )

        server.turns.set(table.matchSessionId, {
          play,
          resolve,
          timeout,
        })
      })
    },
    onTruco(table, play) {
      return new Promise<void>((resolve, reject) => {
        const session = play.player?.session as string
        if (!session || !play || !play.player) {
          throw new Error("No session, play instance or player found")
        }

        server
          .emitWaitingPossibleSay(play, table)
          .then(() => resolve())
          .catch((e) => {
            logger.error(e, "ONTRUCO CALLBACK ERROR")
            reject(e)
          })

        const player = play.player
        const user = server.users.getOrThrow(session)

        const timeout = server.setTurnTimeout(
          table,
          player,
          user,
          () => server.onTruco(table, play).then(resolve).catch(reject),
          () =>
            server
              .sayCommand(table, play, player, EAnswerCommand.NO_QUIERO)
              .catch(logger.error)
              .finally(reject)
        )

        server.turns.set(table.matchSessionId, {
          play,
          resolve,
          timeout,
        })
      })
    },
    onEnvido(table, play, isPointsRound) {
      return new Promise<void>((resolve, reject) => {
        const session = play.player?.session as string
        if (!session || !play || !play.player) {
          throw new Error("No session, play instance or player found")
        }

        server
          .emitWaitingPossibleSay(play, table)
          .then(() => resolve())
          .catch((e) => {
            logger.error(e, "ONENVIDO CALLBACK ERROR")
            reject(e)
          })

        const player = play.player
        const user = server.users.getOrThrow(session)

        const timeout = server.setTurnTimeout(
          table,
          player,
          user,
          () => server.onEnvido(table, play, isPointsRound).then(resolve).catch(reject),
          () => {
            if (isPointsRound) {
              return server
                .sayCommand(table, play, player, EEnvidoAnswerCommand.SON_BUENAS)
                .catch(logger.error)
                .finally(reject)
            }
            server
              .sayCommand(table, play, player, EAnswerCommand.NO_QUIERO)
              .catch(logger.error)
              .finally(reject)
          }
        )

        server.turns.set(table.matchSessionId, {
          play,
          resolve,
          timeout,
        })
      })
    },
    onHandFinished(table, hand) {
      if (!hand) {
        logger.warn(new Error("Hand finished but there's no previous hand!"))
        return Promise.resolve()
      }

      logger.trace(`Table hand finished - Table State: ${table.state()}`)

      return new Promise<void>((resolve, reject) => {
        server
          .emitPreviousHand(hand, table)
          .then(resolve)
          .catch((e) => {
            logger.error(e, "ONHANDFINISHED CALLBACK ERROR")
            reject(e)
          })
      })
    },
    onWinner(table, _winner) {
      return new Promise<void>((resolve) => {
        logger.debug(table.getPublicMatchInfo(), "Match has finished with a winner")
        server
          .emitMatchUpdate(table)
          .then(() =>
            server.getTableSockets(table, async (playerSocket, player) => {
              if (player) {
                const activeMatches = server.getSessionActiveMatches(player.session)
                logger.trace({ activeMatches }, "Match finished, updating active matches")
                playerSocket.emit(EServerEvent.UPDATE_ACTIVE_MATCHES, activeMatches)
              }
            })
          )
          .catch((e) => {
            logger.error(e, "ONWINNER CALLBACK ERROR")
            resolve()
          })
      })
    },
    async startMatch(matchSessionId) {
      try {
        const table = server.tables.getOrThrow(matchSessionId)

        server.resetSocketsMatchState(table)

        if (table && !table.lobby.gameLoop) {
          table.lobby
            .startMatch()
            .onHandFinished(server.onHandFinished.bind(this, table))
            .onTurn(server.onTurn.bind(this, table))
            .onEnvido(server.onEnvido.bind(this, table))
            .onTruco(server.onTruco.bind(this, table))
            .onWinner(server.onWinner.bind(this, table))
            .begin()
            .then(() => logger.trace(table.getPublicMatchInfo(), "Match finished"))
            .catch(logger.error)

          server.tables.set(matchSessionId as string, table)

          server
            .getTableSockets(table, async (playerSocket, player) => {
              if (player) {
                playerSocket.emit(
                  EServerEvent.UPDATE_ACTIVE_MATCHES,
                  server.getSessionActiveMatches(player.session)
                )
              }
            })
            .catch(console.error)

          return
        }
      } catch (e) {
        logger.error(e)
      }
    },
    emitSocketMatch(socket, matchId) {
      if (!matchId) {
        return null
      }

      const currentTable = server.tables.get(matchId)

      if (currentTable) {
        socket.join(currentTable.matchSessionId)

        if (!socket.data.user?.session) {
          return null
        }

        if (socket.data.matches) {
          socket.data.matches.set(currentTable.matchSessionId, {
            isWaitingForPlay: false,
            isWaitingForSay: false,
          })
        }

        const { play, resolve } = server.turns.get(currentTable.matchSessionId) || {}
        if (play && play.player && currentTable.isSessionPlaying(socket.data.user.session)) {
          if (
            play.state === EHandState.WAITING_PLAY &&
            socket.data.user.session === play.player.session
          ) {
            logger.debug(
              {
                ...socket.data.user.getPublicUser(),
                socket: socket.id,
              },
              "Emitting user's socket current playing match: waiting for play"
            )
            server.emitWaitingForPlay(play, currentTable).then(resolve).catch(logger.error)
          } else {
            logger.debug(
              {
                ...socket.data.user.getPublicUser(),
                socket: socket.id,
              },
              "Emitting user's socket current playing match: waiting possible say"
            )
            server.emitWaitingPossibleSay(play, currentTable).then(resolve).catch(logger.error)
          }
        } else {
          logger.debug(socket.data.user.getPublicUser(), "Emitting public match to a spectator")
          socket.emit(
            EServerEvent.UPDATE_MATCH,
            currentTable.getPublicMatch(socket.data.user.session)
          )
        }
        return currentTable.getPublicMatch(socket.data.user.session)
      }
      return null
    },
    leaveMatch(matchId, socketId) {
      logger.debug({ matchId, socketId }, "Socket just left a match")
      return new Promise((resolve) => {
        const playingMatch = _getPossiblePlayingMatch(matchId, socketId)

        if (!playingMatch) {
          return resolve()
        }

        if (!playingMatch.player || !playingMatch.user) {
          logger.trace({ matchId, socketId }, "Socket left a match but user isn't playing")
          return resolve()
        }

        const { player, table, user } = playingMatch

        if (table.state() === EMatchTableState.FINISHED) {
          logger.debug(
            { matchId, socketId },
            "Socket left a match and match is finished, deleting match table..."
          )
          server.cleanupMatchTable(table)
          return resolve()
        }

        if (player.isOwner) {
          const otherPlayer = table.lobby.players.find((p) => p.key !== player.key)
          if (otherPlayer) {
            user.ownedMatches.delete(table.matchSessionId)
            player.setIsOwner(false)
            server.users.getOrThrow(otherPlayer.session).ownedMatches.add(table.matchSessionId)
            otherPlayer.setIsOwner(true)
          }
        }

        server.getTableSockets(table).then(({ players }) => {
          const find = players.find((p) => p.key === player.key)

          if (find) {
            logger.debug(
              { matchId, socketId },
              "Socket left a match but there's another socket for the same player, doing nothing..."
            )
            return resolve()
          }

          logger.debug({ matchId, socketId }, "Socket left a match, waiting for reconnection...")

          const update = () => server.emitMatchUpdate(table, []).catch(console.error)

          table.playerDisconnected(player)
          update()

          user
            .waitReconnection(table.matchSessionId)
            .then(() => {
              table.playerReconnected(player)
            })
            .catch(() => {
              table.playerAbandoned(player)
            })
            .finally(update)

          resolve()
        })
      })
    },
    cleanupMatchTable(table) {
      try {
        for (const player of table.lobby.players) {
          const user = server.users.getOrThrow(player.session)
          user.resolveWaitingPromises(table.matchSessionId) // resolve promises and timeouts
          if (player.isOwner) {
            user.ownedMatches.delete(table.matchSessionId)
          }
        }
      } catch (e) {
        logger.error(e)
      } finally {
        server.tables.delete(table.matchSessionId)
      }
    },
  }

  const _getPossiblePlayingMatch = (
    room: any,
    socketId: any
  ): { table: IMatchTable; player?: IPlayer; user?: IUser } | null => {
    const socket = server.io.sockets.sockets.get(socketId)

    if (!socket || !socket.data.user) {
      return null
    }

    const table = server.tables.get(room)
    if (table) {
      const player = table.isSessionPlaying(socket.data.user.session)
      if (player) {
        return { table, player, user: socket.data.user }
      }
      return { table }
    }
    return null
  }

  io.of("/").adapter.on("leave-room", (room, socketId) => {
    logger.info({ room, socketId }, "Player socket left match room")
    server.leaveMatch(room, socketId).catch(logger.error)
  })

  io.of("/").adapter.on("join-room", (room, socketId) => {
    const playingMatch = _getPossiblePlayingMatch(room, socketId)
    if (!playingMatch || !playingMatch.user) {
      return
    }
    const { table, user } = playingMatch

    logger.debug({ matchId: room, socketId }, "Player socket joined match room")

    user.reconnect(table.matchSessionId)
  })

  return server
}
