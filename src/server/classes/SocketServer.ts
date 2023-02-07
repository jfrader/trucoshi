import e from "cors"
import { randomUUID } from "crypto"
import { createServer, Server as HttpServer } from "http"
import { Server, Socket } from "socket.io"
import { IPlayer, IPlayInstance, IPublicPlayer, ITeam } from "../../lib"
import {
  ClientToServerEvents,
  ECommand,
  EHandState,
  EMatchTableState,
  ESayCommand,
  EServerEvent,
  IEventCallback,
  IPublicMatch,
  IWaitingPlayData,
  ServerToClientEvents,
} from "../../types"
import { PREVIOUS_HAND_ACK_TIMEOUT } from "../constants"
import { Chat, IChat } from "./Chat"
import { IMatchTable } from "./MatchTable"
import { ITrucoshi } from "./Trucoshi"
import { IUser, User } from "./User"

interface InterServerEvents {}

interface SocketData {
  user?: IUser
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

export interface ISocketServer extends ITrucoshi {
  io: TrucoshiServer
  httpServer: HttpServer
  chat: IChat
  getTableSockets(
    table: IMatchTable,
    callback?: (playerSocket: TrucoshiSocket, player: IPlayer | null) => Promise<void>
  ): Promise<{ sockets: any[]; players: IPublicPlayer[] }>
  setOrGetSession(
    socket: TrucoshiSocket,
    id: string | null,
    session: string | null,
    callback: IEventCallback<{
      session?: string
    }>
  ): Promise<IUser>
  leaveMatch(matchId: string, socketId: string, mayReconnect?: boolean): Promise<void>
  emitWaitingPossibleSay(play: IPlayInstance, table: IMatchTable): Promise<ECommand>
  emitWaitingForPlay(play: IPlayInstance, table: IMatchTable): Promise<void>
  emitMatchUpdate(table: IMatchTable, skipSocketIds?: Array<string>): Promise<void>
  emitPreviousHand(play: IPlayInstance, table: IMatchTable): Promise<void>
  emitSocketMatch(socket: TrucoshiSocket, currentMatchId: string | null): IPublicMatch | null
  startMatch(matchSessionId: string): Promise<void>
  onTurn(table: IMatchTable, play: IPlayInstance, newHandJustStarted: boolean): Promise<void>
  onTruco(table: IMatchTable, play: IPlayInstance): Promise<void>
  onWinner(table: IMatchTable, winner: ITeam): Promise<void>
  cleanupMatchTable(match: IMatchTable): void
  listen: (callback: (io: TrucoshiServer) => void) => void
}

export const SocketServer = (
  trucoshi: ITrucoshi,
  port: number,
  origin?: string | Array<string>
) => {
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

  const server: ISocketServer = {
    io,
    httpServer,
    turns: trucoshi.turns,
    tables: trucoshi.tables,
    users: trucoshi.users,
    chat: Chat(io),
    listen(callback) {
      httpServer.listen(port, undefined, undefined, () => callback(server.io))
    },
    async setOrGetSession(
      socket: TrucoshiSocket,
      id: string | null,
      session: string | null,
      callback: IEventCallback<{
        session?: string
      }> = () => {}
    ) {
      if (session) {
        const user = server.users.get(session)
        if (user) {
          const newId = id || user.id || "Satoshi"
          user.connect()
          user.setId(newId)
          socket.data.user = user
          callback({ success: true, session })
          return user
        }
      }

      const newSession = randomUUID()
      const userKey = randomUUID()
      const newId = id || "Satoshi"
      const newUser = User(userKey, newId, newSession)
      socket.data.user = newUser
      server.users.set(newSession, newUser)
      callback({ success: false, session: newSession })
      return newUser
    },
    async getTableSockets(table, callback) {
      return new Promise(async (resolve) => {
        const sockets = await server.io.sockets.adapter.fetchSockets({
          rooms: new Set([table.matchSessionId]),
        })

        const players: IPublicPlayer[] = []

        for (const playerSocket of sockets) {
          if (!playerSocket.data.user?.session) {
            continue
          }

          const player = table.isSessionPlaying(playerSocket.data.user.session)

          if (player) {
            players.push(player)
          }

          if (callback) {
            await callback(playerSocket, player)
          }
        }

        resolve({ sockets, players })
      })
    },
    async emitMatchUpdate(table, skipSocketIds = []) {
      await server.getTableSockets(table, async (playerSocket: TrucoshiSocket) => {
        if (skipSocketIds.includes(playerSocket.id)) {
          return
        }
        playerSocket.emit(
          EServerEvent.UPDATE_MATCH,
          table.getPublicMatch(playerSocket.data.user?.session as string)
        )
      })
    },
    async emitWaitingPossibleSay(play, table) {
      let someoneSaidSomething = false
      return new Promise<ECommand>((resolve, reject) => {
        return server.getTableSockets(table, async (playerSocket, player) => {
          if (!player) {
            return
          }

          playerSocket.emit(
            EServerEvent.WAITING_POSSIBLE_SAY,
            table.getPublicMatch(player.session),
            (data) => {
              if (!data) {
                return
              }
              if (someoneSaidSomething) {
                return
              }
              const { command } = data
              try {
                if (command) {
                  const saidCommand = play.say(command, player)
                  if (saidCommand) {
                    someoneSaidSomething = true
                    server.chat.rooms
                      .getOrThrow(table.matchSessionId)
                      .command(player.teamIdx as 0 | 1, saidCommand)
                    return resolve(saidCommand)
                  }
                }
              } catch (e) {
                reject(e)
              }
            }
          )
        })
      })
    },
    async emitWaitingForPlay(play, table) {
      return new Promise<void>((resolve, reject) => {
        server
          .emitWaitingPossibleSay(play, table)
          .then(() => {
            resolve()
          })
          .catch(console.error)
        return server.getTableSockets(table, async (playerSocket, player) => {
          if (!player) {
            return
          }
          if (player.session === play.player?.session) {
            playerSocket.emit(
              EServerEvent.WAITING_PLAY,
              table.getPublicMatch(player.session),
              (data: IWaitingPlayData) => {
                if (!data) {
                  return reject(new Error(EServerEvent.WAITING_PLAY + " callback returned empty"))
                }
                const { cardIdx, card } = data
                if (cardIdx !== undefined && card) {
                  const playedCard = play.use(cardIdx, card)
                  if (playedCard) {
                    return resolve()
                  }
                  return reject(new Error("Invalid Card"))
                }
                return reject(new Error("Invalid Callback Response"))
              }
            )
          }
        })
      })
    },
    async emitPreviousHand(play, table) {
      return new Promise<void>(async (resolve, reject) => {
        try {
          const promises: Array<PromiseLike<void>> = []
          await server.getTableSockets(table, async (playerSocket, player) => {
            promises.push(
              new Promise<void>((resolvePlayer, rejectPlayer) => {
                if (!player || !play.prevHand) {
                  return rejectPlayer()
                }
                playerSocket.emit(
                  EServerEvent.PREVIOUS_HAND,
                  table.getPreviousHand(play.prevHand),
                  resolvePlayer
                )
                setTimeout(() => {
                  rejectPlayer()
                }, PREVIOUS_HAND_ACK_TIMEOUT)
              })
            )
          })
          await Promise.allSettled(promises)
          resolve()
        } catch (e) {
          reject(e)
        }
      })
    },
    onTurn(table, play, newHandJustStarted) {
      return new Promise<void>(async (resolve, reject) => {
        server.turns.set(table.matchSessionId, {
          play,
          resolve,
        })

        try {
          const session = play.player?.session as string
          if (!session || !play) {
            throw new Error("Unexpected Error")
          }
          server.users.getOrThrow(session)

          if (newHandJustStarted) {
            await server.emitPreviousHand(play, table)
          }

          await server.emitWaitingForPlay(play, table)

          return resolve()
        } catch (e) {
          reject(e)
        }
      })
    },
    onTruco(table, play) {
      return new Promise<void>(async (resolve, reject) => {
        server.turns.set(table.matchSessionId, {
          play,
          resolve,
        })

        try {
          await server.emitWaitingPossibleSay(play, table)
          return resolve()
        } catch (e) {
          reject(e)
        }
      })
    },
    async onWinner(table, _winner) {
      await server.emitMatchUpdate(table)
    },
    async startMatch(matchSessionId) {
      const table = server.tables.getOrThrow(matchSessionId)
      if (table && !table.lobby.gameLoop) {
        table.lobby
          .startMatch()
          .onTurn(server.onTurn.bind(this, table))
          .onTruco(server.onTruco.bind(this, table))
          .onWinner(server.onWinner.bind(this, table))
          .begin()

        server.tables.set(matchSessionId as string, table)
        return
      }
    },
    emitSocketMatch(socket, matchId) {
      if (!matchId || !socket.data.user?.session) {
        return null
      }

      const currentTable = server.tables.get(matchId)

      if (currentTable) {
        socket.join(currentTable.matchSessionId)

        const { play, resolve } = server.turns.get(currentTable.matchSessionId) || {}
        if (play && play.player && currentTable.isSessionPlaying(socket.data.user.session)) {
          if (
            play.state === EHandState.WAITING_PLAY &&
            socket.data.user.session === play.player.session
          ) {
            server.emitWaitingForPlay(play, currentTable).then(resolve).catch(console.error)
          } else {
            server.emitWaitingPossibleSay(play, currentTable).then(resolve).catch(console.error)
          }
        } else {
          socket.emit(
            EServerEvent.UPDATE_MATCH,
            currentTable.getPublicMatch(socket.data.user.session)
          )
        }
        return currentTable.getPublicMatch(socket.data.user.session)
      }
      return null
    },
    leaveMatch(matchId, socketId, mayReconnect) {
      return new Promise((resolve, reject) => {
        const _abandon = (table: IMatchTable, player: IPlayer, abandon: () => void) => {
          try {
            const { play, resolve: playResolve } = server.turns.getOrThrow(table.matchSessionId)
            play.say(ESayCommand.MAZO, player)
            playResolve()
            abandon()
          } catch (e) {
            reject(e)
          }
        }
        const playingMatch = _getPossiblePlayingMatch(matchId, socketId)
        if (!playingMatch) {
          return reject(new Error("Match not found"))
        }
        const { player, table, user } = playingMatch

        if (table.state() === EMatchTableState.FINISHED && table.lobby.gameLoop?.winner) {
          server.cleanupMatchTable(table)
          return resolve()
        }

        if (!mayReconnect) {
          return _abandon(table, player, resolve)
        }

        server.getTableSockets(table).then(({ players }) => {
          const find = players.find((p) => p.key === player.key)

          if (find) {
            return resolve()
          }

          table.waitPlayerReconnection(
            player,
            (reconnect, abandon) => {
              user.waitReconnection(
                table.matchSessionId,
                reconnect,
                _abandon.bind({}, table, player, abandon)
              )
            },
            () => {
              server.emitMatchUpdate(table, [])
            }
          )
          resolve()
        })
      })
    },
    cleanupMatchTable(table) {
      try {
        for (const player of table.lobby.players) {
          const user = server.users.getOrThrow(player.session)
          user.reconnect(table.matchSessionId) // resolve promises and timeouts
          server.tables.delete(table.matchSessionId)
          if (player.isOwner) {
            user.setOwnedMatch(null)
          }
        }
      } catch (e) {
        console.error(e)
      }
    },
  }

  const _getPossiblePlayingMatch = (
    room: any,
    socketId: any
  ): { table: IMatchTable; player: IPlayer; user: IUser } | null => {
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
    }
    return null
  }

  io.of("/").adapter.on("leave-room", (room, socketId) => {
    server.leaveMatch(room, socketId, true).then().catch(console.error)
  })

  io.of("/").adapter.on("join-room", (room, socketId) => {
    const playingMatch = _getPossiblePlayingMatch(room, socketId)
    if (!playingMatch) {
      return
    }
    const { table, user } = playingMatch
    user.reconnect(table.matchSessionId)
  })

  return server
}
