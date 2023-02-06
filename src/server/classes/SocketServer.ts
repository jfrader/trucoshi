import e from "cors"
import { randomUUID } from "crypto"
import { createServer } from "http"
import { Server, Socket } from "socket.io"
import { IHand, IPlayer, IPlayInstance } from "../../lib"
import {
  ClientToServerEvents,
  ECommand,
  EHandState,
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
  chat: IChat
  getTableSockets(
    table: IMatchTable,
    callback: (playerSocket: TrucoshiSocket, player: IPlayer | null) => Promise<void>
  ): Promise<void>
  setOrGetSession(
    socket: TrucoshiSocket,
    id: string | null,
    session: string | null,
    callback: IEventCallback<{
      session?: string
    }>
  ): Promise<void>
  emitWaitingPossibleSay(play: IPlayInstance, table: IMatchTable): Promise<ECommand>
  emitWaitingForPlay(play: IPlayInstance, table: IMatchTable): Promise<void>
  emitMatchUpdate(table: IMatchTable, skipSocketIds?: Array<string>): Promise<void>
  emitPreviousHand(play: IPlayInstance, table: IMatchTable): Promise<void>
  emitSocketMatch(socket: TrucoshiSocket, currentMatchId: string | null): IPublicMatch | null
  startMatch(matchSessionId: string): Promise<void>
  listen: () => void
}

export const SocketServer = (trucoshi: ITrucoshi, port: number, origin: string | Array<string>) => {
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
    turns: trucoshi.turns,
    tables: trucoshi.tables,
    users: trucoshi.users,
    chat: Chat(io),
    listen() {
      httpServer.listen(port)
      console.log("Listening on", port, " from origin at", origin)
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
          return callback({ success: true, session })
        }
      }

      const newSession = randomUUID()
      const userKey = randomUUID()
      const newId = id || "Satoshi"
      const newUser = User(userKey, newId, newSession)
      socket.data.user = newUser
      server.users.set(newSession, newUser)
      callback({ success: false, session: newSession })
    },
    async getTableSockets(table, callback) {
      return new Promise<void>(async (resolve) => {
        const sockets = await server.io.sockets.adapter.fetchSockets({
          rooms: new Set([table.matchSessionId]),
        })

        for (const playerSocket of sockets) {
          if (!playerSocket.data.user?.session) {
            continue
          }

          const player = table.isSessionPlaying(playerSocket.data.user.session)

          await callback(playerSocket, player)
        }

        resolve()
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
                return reject(
                  new Error(EServerEvent.WAITING_POSSIBLE_SAY + " callback returned empty")
                )
              }
              const { command } = data
              try {
                if (command) {
                  const saidCommand = play.say(command, player)
                  if (saidCommand) {
                    server.chat.rooms
                      .get(table.matchSessionId)
                      ?.send({ id: player.id, key: player.key }, saidCommand)
                    return resolve(saidCommand)
                  }
                }
                reject(new Error("Tried to play empty command"))
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
    async startMatch(matchSessionId) {
      const table = server.tables.getOrThrow(matchSessionId)
      if (table && !table.lobby.gameLoop) {
        table.lobby
          .startMatch()
          .onTurn((play) => {
            return new Promise<void>(async (resolve, reject) => {
              const currentTurn = server.turns.get(table.matchSessionId)
              const emitPreviousHand = currentTurn
                ? currentTurn.previousHandIdx !== play.prevHand?.idx
                : false

              server.turns.set(table.matchSessionId, {
                play,
                resolve,
                previousHandIdx: play.prevHand ? play.prevHand.idx : null,
              })

              try {
                const session = play.player?.session as string
                if (!session || !play) {
                  throw new Error("Unexpected Error")
                }
                server.users.getOrThrow(session)

                if (emitPreviousHand) {
                  await server.emitPreviousHand(play, table)
                }

                await server.emitWaitingForPlay(play, table)

                return resolve()
              } catch (e) {
                reject(e)
              }
            })
          })
          .onTruco((play) => {
            return new Promise<void>(async (resolve, reject) => {
              server.turns.update(table.matchSessionId, {
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
          })
          .onWinner(async () => {})
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
  }

  const getPossiblePlayingMatch = (
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
    const playingMatch = getPossiblePlayingMatch(room, socketId)
    if (!playingMatch) {
      return
    }
    const { player, table, user } = playingMatch

    table.waitPlayerReconnection(
      player,
      (reconnect, abandon) => {
        user.waitReconnection(table.matchSessionId, reconnect, abandon)
      },
      () => {
        server.emitMatchUpdate(table, [])
      }
    )
  })

  io.of("/").adapter.on("join-room", (room, socketId) => {
    const playingMatch = getPossiblePlayingMatch(room, socketId)
    if (!playingMatch) {
      return
    }
    const { table, user } = playingMatch
    user.reconnect(table.matchSessionId)
  })

  return server
}
