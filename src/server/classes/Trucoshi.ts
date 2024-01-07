import jwt, { JwtPayload } from "jsonwebtoken"
import { randomUUID } from "crypto"
import { createServer, Server as HttpServer } from "http"
import { Server, Socket } from "socket.io"
import { IHand, IPlayInstance } from "../../lib"
import {
  ClientToServerEvents,
  EAnswerCommand,
  ECommand,
  EHandState,
  ESayCommand,
  EServerEvent,
  ICard,
  IEventCallback,
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
  MATCH_FINISHED_CLEANUP_TIMEOUT,
  PLAYER_LOBBY_TIMEOUT,
  PLAYER_TIMEOUT_GRACE,
} from "../constants"
import { Chat, IChat } from "./Chat"
import { IMatchTable } from "./MatchTable"
import { IUserSession, ISocketMatchState, UserSession, IUserData } from "./UserSession"
import logger from "../../utils/logger"
import { IStore, Store } from "../../store/classes/Store"
import { prismaClient } from "../../store/client"
import { User } from "lightning-accounts"
import { getPublicKey } from "../../utils/config/lightningAccounts"

import { createAdapter } from "@socket.io/redis-adapter"

import { accountsApi } from "../../accounts/client"
import { createClient } from "redis"
import { EMatchState } from "@prisma/client"

interface ITrucoshiTurn {
  play: IPlayInstance
  timeout: NodeJS.Timeout
  resolve(): void
}

interface MatchTableMap extends TMap<string, IMatchTable> {
  getAll(filters: { state?: Array<EMatchState> }): Array<IPublicMatchInfo>
}

class MatchTableMap extends TMap<string, IMatchTable> {
  getAll(filters: { state?: Array<EMatchState> } = {}) {
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
  user?: IUserData
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
  store: IStore
  chat: IChat
  tables: MatchTableMap // sessionId, table
  sessions: TMap<string, IUserSession> // sessionId, user
  turns: TMap<string, ITrucoshiTurn> // sessionId, play instance
  createUserSession(socket: TrucoshiSocket, username?: string, token?: string): IUserSession
  getTableSockets(
    table: IMatchTable,
    callback?: (playerSocket: TrucoshiSocket, player: IPlayer | null) => Promise<void>
  ): Promise<{ sockets: any[]; players: IPublicPlayer[]; spectators: any[] }>
  getSessionActiveMatches(session?: string): IPublicMatchInfo[]
  login(
    socket: TrucoshiSocket,
    account: User,
    identityJwt: string,
    callback: IEventCallback<{}>
  ): Promise<void>
  logout(socket: TrucoshiSocket, callback: IEventCallback<{}>): void
  emitSocketSession(socket: TrucoshiSocket): Promise<void>
  leaveMatch(matchId: string, socketId: string): Promise<void>
  emitWaitingPossibleSay(
    play: IPlayInstance,
    table: IMatchTable,
    freshHand?: boolean
  ): Promise<ECommand | number>
  emitWaitingForPlay(
    play: IPlayInstance,
    table: IMatchTable,
    freshHand?: boolean
  ): Promise<"say" | "play">
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
    user: IUserSession,
    retry: () => void,
    cancel: () => void
  ): NodeJS.Timeout
  onHandFinished(table: IMatchTable, hand: IHand | null): Promise<void>
  onTurn(table: IMatchTable, play: IPlayInstance): Promise<void>
  onTruco(table: IMatchTable, play: IPlayInstance): Promise<void>
  onEnvido(table: IMatchTable, play: IPlayInstance, isPointsRounds: boolean): Promise<void>
  onWinner(table: IMatchTable, winner: ITeam): Promise<void>
  removePlayerAndCleanup(table: IMatchTable, player: IPlayer): void
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

  const pubClient = createClient({ url: process.env.REDIS_URL })
  const subClient = pubClient.duplicate()

  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      cors: {
        credentials: true,
        origin,
        methods: ["GET", "POST"],
      },
    }
  )

  const store = Store(prismaClient)
  const chat = Chat(io)

  const sessions = new TMap<string, IUserSession>() // sessionId (token), user
  const tables = new MatchTableMap() // sessionId, table
  const turns = new TMap<string, ITrucoshiTurn>() // sessionId, play instance, play promise resolve and type

  const server: ITrucoshi = {
    sessions,
    store,
    tables,
    turns,
    io,
    httpServer,
    chat,
    listen(callback) {
      accountsApi.auth
        .getAuth()
        .catch((e) => {
          logger.error(e, "Failed to login to lightning-accounts")
        })
        .then(() => {
          logger.info("Logged in to lightning-accounts")
          return Promise.all([pubClient.connect(), subClient.connect()])
        })
        .then(() => logger.info("Connected to redis"))
        .catch((e) => {
          logger.error(e, "Failed to connect to Redis")
        })
        .finally(() => {
          io.adapter(createAdapter(pubClient, subClient))
          io.listen(port)
          server.chat = Chat(io)
          callback(io)
        })
    },
    getSessionActiveMatches(session) {
      if (!session) {
        return []
      }
      return server.tables
        .findAll((table) => {
          if (table.state() === EMatchState.FINISHED) {
            return false
          }
          return Boolean(table.isSessionPlaying(session))
        })
        .map((match) => match.getPublicMatchInfo())
    },
    createUserSession(socket, id, token) {
      const session = token || randomUUID()
      const key = randomUUID()
      const userSession = UserSession(key, id || "Satoshi", session)
      socket.data.user = userSession
      socket.data.matches = new TMap()
      server.sessions.set(session, userSession)

      return userSession
    },
    async login(socket, me, identityJwt, callback) {
      if (!socket.data.user) {
        return callback({ success: false })
      }

      try {
        let session = server.sessions.getOrThrow(socket.data.user.session)
        const payload = jwt.verify(identityJwt, getPublicKey()) as JwtPayload

        if (!payload.sub || me.id !== Number(payload.sub)) {
          return callback({ success: false })
        }

        const existingSession = server.sessions.find((s) => s.account?.id === payload.sub)

        const res = await accountsApi.users.usersDetail(payload.sub)

        if (existingSession) {
          socket.data.user = existingSession.getUserData()
          session = existingSession
        }

        session.setAccount(res.data)

        logger.info(res.data, "Logging in account")

        return callback({ success: true })
      } catch (e) {
        logger.error(e)
        return callback({ success: false })
      }
    },
    logout(socket, callback) {
      if (!socket.data.user) {
        return callback({ success: false })
      }

      try {
        const session = server.sessions.getOrThrow(socket.data.user.session)
        session.setAccount(null)
        return callback({ success: true })
      } catch (e) {
        logger.error(e)
        return callback({ success: false })
      }
    },
    async emitSocketSession(socket) {
      if (!socket.data.user) {
        return
      }
      const activeMatches = server.getSessionActiveMatches(socket.data.user.session)
      socket.emit(EServerEvent.SET_SESSION, socket.data.user, serverVersion, activeMatches)
    },
    async getTableSockets(table, callback) {
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
    async emitWaitingPossibleSay(play, table, freshHand = false) {
      logger.debug(
        { match: table.getPublicMatchInfo(), handIdx: play.handIdx },
        "Emitting match possible players say"
      )
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

            if (player.disabled) {
              return
            }

            playerSocket.emit(
              EServerEvent.WAITING_POSSIBLE_SAY,
              table.getPublicMatch(player.session, freshHand),
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
                    server.sessions.getOrThrow(player.session).reconnect(table.matchSessionId)
                  })
                  .catch(reject)
              }
            )
          })
          .catch(console.error)
      })
    },
    async emitWaitingForPlay(play, table, freshHand) {
      return new Promise<"say" | "play">((resolve, reject) => {
        server
          .emitWaitingPossibleSay(play, table, freshHand)
          .then(() => resolve("say"))
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
                {
                  match: table.getPublicMatchInfo(),
                  player: player.getPublicPlayer(),
                  handIdx: play.handIdx,
                },
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
                      resolve("play")
                      server.sessions.getOrThrow(player.session).reconnect(table.matchSessionId)
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
          logger.trace({ player, command }, "Attempt to say command")
          const saidCommand = play.say(command, player)
          if (saidCommand || saidCommand === 0) {
            logger.debug({ player, command }, "Say command success")
            clearTimeout(server.turns.getOrThrow(table.matchSessionId).timeout)

            server.chat.rooms
              .getOrThrow(table.matchSessionId)
              .command(player.teamIdx as 0 | 1, saidCommand)

            return server
              .resetSocketsMatchState(table)
              .then(() => resolve(saidCommand))
              .catch(reject)
          }
          return reject(new Error("Invalid Command " + command))
        }
        return reject(new Error("Undefined Command"))
      })
    },
    playCard(table, play, player, cardIdx, card) {
      return new Promise<void>((resolve, reject) => {
        if (cardIdx !== undefined && card) {
          logger.trace({ player, card, cardIdx }, "Attempt to play card")
          const playedCard = play.use(cardIdx, card)
          if (playedCard) {
            logger.debug({ player, card, cardIdx }, "Play card success")
            clearTimeout(server.turns.getOrThrow(table.matchSessionId).timeout)

            server.chat.rooms.getOrThrow(table.matchSessionId).card(player, playedCard)
            return server.resetSocketsMatchState(table).then(resolve).catch(reject)
          }
          return reject(new Error("Invalid Card " + card))
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
            setTimeout(rejectPlayer, table.lobby.options.handAckTime + PLAYER_TIMEOUT_GRACE)
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
      logger.trace({ player, options: table.lobby.options }, "Setting turn timeout")
      player.setTurnExpiration(table.lobby.options.turnTime, table.lobby.options.abandonTime)

      const chat = server.chat.rooms.getOrThrow(table.matchSessionId)

      return setTimeout(() => {
        logger.trace(
          { match: table.getPublicMatchInfo(), player: player.getPublicPlayer() },
          "Turn timed out, disconnecting"
        )

        table.playerDisconnected(player)

        user
          .waitReconnection(table.matchSessionId, table.lobby.options.abandonTime)
          .then(() => {
            logger.trace(
              { match: table.getPublicMatchInfo(), player: player.getPublicPlayer() },
              "Player reconnected"
            )
            table.playerReconnected(player)
            onReconnection()
          })
          .catch(() => {
            logger.trace(
              { match: table.getPublicMatchInfo(), player: player.getPublicPlayer() },
              "Player abandoned"
            )
            table.playerAbandoned(player)
            chat.system(`${player.id} se retiro de la partida.`)
            onTimeout()
          })
          .finally(() => server.emitMatchUpdate(table).catch(logger.error))
      }, table.lobby.options.turnTime + PLAYER_TIMEOUT_GRACE)
    },
    onTurn(table, play) {
      logger.trace(
        { match: table.getPublicMatchInfo(), player: play.player, handIdx: play.handIdx },
        "Turn started"
      )
      return new Promise<void>((resolve, reject) => {
        const session = play.player?.session
        if (!session || !play || !play.player) {
          throw new Error("No session, play instance or player found")
        }

        const player = play.player
        const user = server.sessions.getOrThrow(session)

        const turn = () =>
          server
            .emitWaitingForPlay(play, table, play.freshHand)
            .then(() => {
              resolve()
            })
            .catch((e) => {
              logger.debug(e, "ONTURN CALLBACK ERROR")
              turn()
            })

        turn()

        const timeout = server.setTurnTimeout(table, player, user, turn, () =>
          server
            .sayCommand(table, play, player, ESayCommand.MAZO)
            .catch(logger.error)
            .finally(resolve)
        )

        server.turns.set(table.matchSessionId, {
          play,
          resolve,
          timeout,
        })
      })
    },
    onTruco(table, play) {
      logger.trace(
        { match: table.getPublicMatchInfo(), player: play.player, handIdx: play.handIdx },
        "Truco answer turn started"
      )
      return new Promise<void>((resolve, reject) => {
        const session = play.player?.session
        if (!session || !play || !play.player) {
          throw new Error("No session, play instance or player found")
        }

        const turn = () =>
          server
            .emitWaitingPossibleSay(play, table)
            .then(() => resolve())
            .catch((e) => {
              logger.debug(e, "ONTRUCO CALLBACK ERROR")
              // reject(e)
              turn()
            })

        turn()

        const player = play.player
        const user = server.sessions.getOrThrow(session)

        const timeout = server.setTurnTimeout(table, player, user, turn, () =>
          server
            .sayCommand(table, play, player, EAnswerCommand.NO_QUIERO)
            .catch(logger.error)
            .finally(resolve)
        )

        server.turns.set(table.matchSessionId, {
          play,
          resolve,
          timeout,
        })
      })
    },
    onEnvido(table, play, isPointsRound) {
      logger.trace(
        {
          match: table.getPublicMatchInfo(),
          player: play.player,
          handIdx: play.handIdx,
          isPointsRound,
        },
        "Envido answer turn started"
      )
      return new Promise<void>((resolve, reject) => {
        const session = play.player?.session as string
        if (!session || !play || !play.player) {
          throw new Error("No session, play instance or player found")
        }

        const turn = () =>
          server
            .emitWaitingPossibleSay(play, table)
            .then(() => resolve())
            .catch((e) => {
              logger.debug(e, "ONENVIDO CALLBACK ERROR")
              turn()
            })

        turn()

        const player = play.player
        const user = server.sessions.getOrThrow(session)

        const timeout = server.setTurnTimeout(table, player, user, turn, () => {
          if (isPointsRound) {
            return server.sayCommand(table, play, player, 0).catch(logger.error).finally(resolve)
          }
          server
            .sayCommand(table, play, player, EAnswerCommand.NO_QUIERO)
            .catch(logger.error)
            .finally(resolve)
        })

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
    onWinner(table, winner) {
      return new Promise<void>((resolve) => {
        logger.debug(table.getPublicMatchInfo(), "Match has finished with a winner")

        const chat = server.chat.rooms.getOrThrow(table.matchSessionId)
        chat.system(`${winner.name} es el equipo ganador!`)

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

        setTimeout(() => {
          server.cleanupMatchTable(table)
        }, MATCH_FINISHED_CLEANUP_TIMEOUT)
      })
    },
    async startMatch(matchSessionId) {
      try {
        const table = server.tables.getOrThrow(matchSessionId)

        server.resetSocketsMatchState(table).catch(logger.error)

        if (table && !table.lobby.gameLoop) {
          table.lobby
            .startMatch()
            .onHandFinished(server.onHandFinished.bind(this, table))
            .onTurn(server.onTurn.bind(null, table))
            .onEnvido(server.onEnvido.bind(null, table))
            .onTruco(server.onTruco.bind(null, table))
            .onWinner(server.onWinner.bind(null, table))
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
                ...socket.data.user,
                socket: socket.id,
              },
              "Emitting user's socket current playing match: waiting for play"
            )
            server.emitWaitingForPlay(play, currentTable).then(resolve).catch(logger.error)
          } else {
            logger.debug(
              {
                ...socket.data.user,
                socket: socket.id,
              },
              "Emitting user's socket current playing match: waiting possible say"
            )
            server.emitWaitingPossibleSay(play, currentTable).then(resolve).catch(logger.error)
          }
        }
        return currentTable.getPublicMatch(socket.data.user.session)
      }
      return null
    },
    leaveMatch(matchId, socketId) {
      return new Promise((resolve) => {
        logger.debug({ matchId, socketId }, "Socket trying to leave a match")
        const playingMatch = _getPossiblePlayingMatch(matchId, socketId)

        if (!playingMatch) {
          return resolve()
        }

        if (!playingMatch.player || !playingMatch.user) {
          logger.trace({ matchId, socketId }, "Socket left a match but isn't a player")
          return resolve()
        }

        const { table, player, user } = playingMatch

        if (table.state() === EMatchState.FINISHED) {
          server.removePlayerAndCleanup(table, player)
          return resolve()
        }

        if (player && table.state() !== EMatchState.STARTED) {
          table.playerDisconnected(player)

          const userSession = server.sessions.getOrThrow(user.session)

          userSession
            .waitReconnection(table.matchSessionId, PLAYER_LOBBY_TIMEOUT)
            .then(() => {
              table.playerReconnected(player)
            })
            .catch(() => {
              table.playerAbandoned(player)
              server.removePlayerAndCleanup(table, player)
            })
            .finally(() => server.emitMatchUpdate(table).catch(logger.error))
        }
      })
    },
    removePlayerAndCleanup(table, player) {
      try {
        const lobby = table.lobby.removePlayer(player.session as string)
        if (lobby.isEmpty()) {
          server.cleanupMatchTable(table)
        }
      } catch (e) {
        logger.error(e)
      }
    },
    cleanupMatchTable(table) {
      const matchId = table.matchSessionId
      try {
        for (const player of table.lobby.players) {
          const user = server.sessions.getOrThrow(player.session)
          user.resolveWaitingPromises(matchId)
          if (player.isOwner) {
            user.ownedMatches.delete(matchId)
          }
        }
      } catch (e) {
        logger.error(e)
      } finally {
        server.tables.delete(matchId)
        server.chat.delete(matchId)
      }
    },
  }
  const _getPossiblePlayingMatch = (
    room: any,
    socketId: any
  ): { table: IMatchTable; player?: IPlayer; user?: IUserData } | null => {
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

    const userSession = server.sessions.getOrThrow(user.session)

    logger.debug({ matchId: room, socketId }, "Player socket joined match room")

    userSession.reconnect(table.matchSessionId)
  })

  return server
}
