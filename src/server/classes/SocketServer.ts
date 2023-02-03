import { createServer } from "http"
import { Server, Socket } from "socket.io"
import { IPlayInstance, IPublicPlayer } from "../../lib"
import {
  ClientToServerEvents,
  EServerEvent,
  IPublicMatch,
  IWaitingPlayData,
  ServerToClientEvents,
} from "../../types"
import { IMatchTable } from "./MatchTable"
import { ITrucoshi } from "./Trucoshi"

interface InterServerEvents {}

interface SocketData {
  session?: string
}

type TrucoshiServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>

type TrucoshiSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>

export interface ISocketServer extends ITrucoshi {
  io: TrucoshiServer
  getTableSockets(
    table: IMatchTable,
    callback: (playerSocket: TrucoshiSocket) => Promise<void>
  ): Promise<void>
  sendMatchUpdate(table: IMatchTable, skipSocketIds?: Array<string>): Promise<void>
  sendWaitingForPlay(table: IMatchTable, play: IPlayInstance): Promise<void>
  startMatch(matchSessionId: string): Promise<void>
  sendCurrentMatch(socket: TrucoshiSocket, currentMatchId: string | null): IPublicMatch | null
  listen: () => void
}

export const SocketServer = (trucoshi: ITrucoshi, port: number, origin: string | Array<string>) => {
  const httpServer = createServer()

  const server: ISocketServer = {
    io: new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
      httpServer,
      {
        cors: {
          origin,
          methods: ["GET", "POST"],
        },
      }
    ),
    turns: trucoshi.turns,
    tables: trucoshi.tables,
    users: trucoshi.users,
    listen() {
      httpServer.listen(port)
      console.log("Listening on", port, " from origin at", origin)
    },
    async getTableSockets(
      table: IMatchTable,
      callback: (playerSocket: TrucoshiSocket) => Promise<void>
    ) {
      return new Promise<void>(async (resolve) => {
        const sockets = await server.io.sockets.adapter.fetchSockets({
          rooms: new Set([table.matchSessionId]),
        })

        for (const playerSocket of sockets) {
          await callback(playerSocket)
        }

        resolve()
      })
    },
    async sendMatchUpdate(table, skipSocketIds = []) {
      await server.getTableSockets(table, async (playerSocket: TrucoshiSocket) => {
        if (skipSocketIds.includes(playerSocket.id)) {
          return
        }
        playerSocket.emit(
          EServerEvent.UPDATE_MATCH,
          table.getPublicMatch(playerSocket.data.session as string)
        )
      })
    },
    async sendWaitingForPlay(table, play) {
      return new Promise<void>((resolve, reject) => {
        return server.getTableSockets(table, async (playerSocket) => {
          if (playerSocket.data.session && playerSocket.data.session === play.player?.session) {
            playerSocket.emit(
              EServerEvent.WAITING_PLAY,
              table.getPublicMatch(playerSocket.data.session),
              (data: IWaitingPlayData) => {
                if (!data) {
                  return reject(new Error("Callback returned empty"))
                }
                const { cardIdx, card, command } = data
                if (cardIdx !== undefined && card) {
                  const playedCard = play.use(cardIdx, card)
                  if (playedCard) {
                    return resolve()
                  }
                  return reject(new Error("Invalid Card"))
                }
                if (command) {
                  const saidCommand = play.say(command)
                  if (saidCommand) {
                    return resolve()
                  }
                  return reject(new Error("Invalid Command"))
                }
                return reject(new Error("Invalid Callback response"))
              }
            )
          }
        })
      })
    },
    async startMatch(matchSessionId) {
      const table = server.tables.getOrThrow(matchSessionId)
      if (table && !table.lobby.gameLoop) {
        table.lobby
          .startMatch()
          .onTurn((play) => {
            return new Promise<void>(async (resolve) => {
              table.setCurrentPlayer(play.player as IPublicPlayer)
              server.turns.set(table.matchSessionId, { play, resolve })

              try {
                const session = play.player?.session as string
                if (!session || !play) {
                  throw new Error("Unexpected Error")
                }
                const user = server.users.get(session)
                if (!user) {
                  throw new Error("Unexpected Error")
                }

                await server.sendMatchUpdate(table)
                await server.sendWaitingForPlay(table, play)

                return resolve()
              } catch (e) {
                console.error("ERROR", e)
              }
            })
          })
          .onTruco(async (play) => {})
          .onWinner(async () => {})
          .begin()

        server.tables.set(matchSessionId as string, table)
        return
      }
      throw new Error("Table not found or already started")
    },
    sendCurrentMatch(socket, matchId) {
      if (!matchId || !socket.data.session) {
        return null
      }

      const currentTable = server.tables.get(matchId)

      if (currentTable) {
        socket.join(currentTable.matchSessionId)

        if (
          currentTable.isSessionPlaying(socket.data.session) &&
          socket.data.session === currentTable.currentPlayer?.session
        ) {
          try {
            const { play, resolve } = server.turns.get(currentTable.matchSessionId) || {}
            if (!play) {
              throw new Error("Unexpected Error")
            }
            server.sendWaitingForPlay(currentTable, play).then(resolve).catch(console.error)
          } catch (e) {
            console.error("ERROR", e)
          }
        } else {
          socket.emit(EServerEvent.UPDATE_MATCH, currentTable.getPublicMatch(socket.data.session))
        }
        return currentTable.getPublicMatch(socket.data.session)
      }
      return null
    },
  }

  return server
}