import { randomUUID } from "crypto"
import { createServer } from "http"
import { Server } from "socket.io"
import { IPublicPlayer } from "../lib/classes/Player"
import { IPlayInstance } from "../lib/types"
import { EMatchTableState, IMatchTable, MatchTable } from "./classes/MatchTable"
import { IUser, User } from "./classes/user"
import {
  EClientEvent,
  EServerEvent,
  IWaitingPlayCallback,
  IWaitingPlayData,
  TrucoshiSocket,
} from "./types"

const PORT = 4001

const httpServer = createServer()
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
})

const users = new Map<string, IUser>() // sessionId, user
const tables = new Map<string, IMatchTable>() // sessionId, table
const turns = new Map<string, { play: IPlayInstance; resolve(): void }>() // sessionId, play instance

const getUser = (session?: string) => {
  const user = users.get(session as string)
  if (user) {
    return user
  }
  throw new Error("User not found")
}

const getTable = (matchSessionId?: string) => {
  const table = tables.get(matchSessionId as string)
  if (table) {
    return table
  }
  throw new Error("Match Session not found")
}

io.on("connection", (_socket) => {
  const socket = _socket as TrucoshiSocket

  const getTableSockets = (
    table: IMatchTable,
    callback: (socket: TrucoshiSocket) => Promise<void>
  ) => {
    return new Promise<void>(async (resolve) => {
      const sockets = await io.sockets.adapter.fetchSockets({
        rooms: new Set([table.matchSessionId]),
      })

      for (const socket of sockets) {
        await callback(socket)
      }

      resolve()
    })
  }

  const emitMatchUpdate = (table: IMatchTable) => {
    table.lobby.players.map((player) => {
      const user = users.get(player.session as string)
      if (user && user.socketId) {
        io.to(user.socketId).emit(
          EServerEvent.UPDATE_MATCH,
          table.getPublicMatch(player.session as string)
        )
      }
    })
  }

  socket.on(EClientEvent.PING, (msg) => {
    socket.emit(EServerEvent.PONG, msg)
  })

  /**
   * Create Match
   */
  socket.on(EClientEvent.CREATE_MATCH, (callback) => {
    if (socket.session) {
      try {
        const user = getUser(socket.session)
        const existingTable = tables.get(socket.session)
        if (existingTable) {
          return callback({
            success: false,
            match: existingTable.getPublicMatch(socket.session),
          })
        }
        const table = MatchTable(socket.session)
        table.lobby.addPlayer(user.id, socket.session)
        tables.set(socket.session, table)
        return callback({ success: true, match: table.getPublicMatch(user.id) })
      } catch (e) {
        console.error("ERROR", e)
        return callback({ success: false, error: e })
      }
    }
    callback({ success: false, error: new Error("Can't create match without an ID") })
  })

  const sendWaitingForPlay = async (table: IMatchTable, session: string, play: IPlayInstance) => {
    await getTableSockets(table, async (playerSocket) => {
      playerSocket.emit(EServerEvent.UPDATE_MATCH, table.getPublicMatch(playerSocket.session))
    })

    await getTableSockets(
      table,
      (playerSocket) =>
        new Promise((resolve) => {
          if (playerSocket.session === session) {
            playerSocket.emit(EServerEvent.WAITING_PLAY, table.getPublicMatch(session))
            playerSocket.once(EClientEvent.PLAY, ({ cardIdx, command }: IWaitingPlayData) => {
              if (cardIdx !== undefined) {
                const playedCard = play.use(cardIdx)
                if (playedCard) {
                  return resolve()
                }
                return console.error("ERROR", new Error("Couldnt play card"))
              }
              if (command) {
                const saidCommand = play.say(command)
                if (saidCommand) {
                  return resolve()
                }
                return console.error("ERROR", new Error("Couldnt say command"))
              }
              return console.error("ERROR", new Error("Play callback didn't have data"))
            })
          } else {
            resolve()
          }
        })
    )
  }

  const startMatch = async () => {
    try {
      const tableId = socket.session
      const table = getTable(tableId)
      if (table && !table.lobby.gameLoop) {
        table.setState(EMatchTableState.STARTED)

        table.lobby
          .startMatch()
          .onTurn((play) => {
            return new Promise(async (resolve) => {
              table.setCurrentPlayer(play.player as IPublicPlayer)
              turns.set(tableId as string, { play, resolve })

              try {
                const session = play.player?.session as string
                if (!session) {
                  throw new Error("Unexpected Error")
                }
                const user = users.get(session)
                if (!user) {
                  throw new Error("Unexpected Error")
                }
                await sendWaitingForPlay(table, session, play)
                resolve()
              } catch (e) {
                console.error("ERROR", e)
              }
            })
          })
          .onTruco(async (play) => {})
          .onWinner(async () => {})
          .begin()

        return tables.set(socket.session as string, table)
      }
      console.error("ASL:KDJALSk")
    } catch (e) {
      console.error("ERROR", e)
    }
  }

  /**
   * Start Match
   */
  socket.on(EClientEvent.START_MATCH, () => {
    if (socket.session && users.has(socket.session)) {
      startMatch()
    }
  })

  /**
   * Join Match
   */
  socket.on(EClientEvent.JOIN_MATCH, (matchSessionId, callback) => {
    if (!socket.session) {
      return callback({ success: false })
    }

    const user = getUser(socket.session)
    const table = tables.get(matchSessionId)

    if (table && table.state === EMatchTableState.UNREADY) {
      table.lobby.addPlayer(user.id || "satoshi", socket.session)

      emitMatchUpdate(table)

      return callback({ success: true, match: table.getPublicMatch(socket.session) })
    }

    callback({ success: false })
  })

  /**
   * Get Match
   */
  socket.on(EClientEvent.GET_MATCH, (matchSessionId, callback) => {
    const table = tables.get(matchSessionId)
    if (table) {
      return callback({ success: true, match: table.getPublicMatch(socket.session) })
    }
    callback({ success: false })
  })

  /**
   * Set Session
   */
  socket.on(EClientEvent.SET_SESSION, (session, id = "satoshi", callback) => {
    const user = users.get(session)
    if (user) {
      const updatedUser: IUser = {
        id,
        socketId: socket.id,
      }
      users.set(session, updatedUser)
      socket.session = session

      tables.forEach(async (table, id) => {
        if (table.isSessionPlaying(session)) {
          socket.join(id)

          if (session === table.currentPlayer?.session) {
            try {
              const { play, resolve } = turns.get(id) || {}
              const session = play?.player?.session as string
              if (!play || !session) {
                throw new Error("Unexpected Error")
              }
              const user = users.get(session)
              if (!user) {
                throw new Error("Unexpected Error")
              }
              await sendWaitingForPlay(table, session, play)
              resolve?.()
            } catch (e) {
              console.error("ERROR", e)
            }
          }

          socket.emit(EServerEvent.UPDATE_MATCH, table.getPublicMatch(session))
        }
      })

      return callback({ success: true, session })
    }

    const newSession = randomUUID()
    socket.session = newSession
    users.set(newSession, User(id, socket.id))
    callback({ success: true, session: newSession })
  })

  /**
   * Set Player Ready
   */
  socket.on(EClientEvent.SET_PLAYER_READY, (matchSessionId, ready) => {
    try {
      const table = getTable(matchSessionId)
      const player = table.lobby.players.find((player) => player.session === socket.session)
      if (player) {
        player.setReady(ready)
        if (ready) {
          socket.join(matchSessionId)
        }
        emitMatchUpdate(table)
      }
    } catch (e) {
      console.error("ERROR", e)
    }
  })
})

httpServer.listen(PORT)

console.log("Listening on port", PORT)
