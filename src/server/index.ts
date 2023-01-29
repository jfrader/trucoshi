import { randomUUID } from "crypto"
import { createServer } from "http"
import { Server, Socket } from "socket.io"
import { GAME_ERROR } from "../lib/constants"
import { EMatchTableState, IMatchTable, MatchTable } from "./classes/MatchTable"
import { IUser, User } from "./classes/user"
import { EClientEvent, EServerEvent, TrucoshiSocket } from "./types"

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

  console.error("New connection")

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
      const user = getUser(socket.session)
      const existingTable = tables.get(socket.session)
      if (existingTable) {
        return callback({
          success: false,
          match: existingTable.getPublicMatch(socket.session),
        })
      }
      try {
        const table = MatchTable(socket.session)
        table.lobby.addPlayer(user.id, socket.session)
        tables.set(socket.session, table)
        console.log("creating match", socket.session, table.state)
        return callback({ success: true, match: table.getPublicMatch(user.id) })
      } catch (e) {
        console.error("ERROR", e)
        return callback({ success: false, error: e })
      }
    }
    callback({ success: false, error: new Error("Can't create match without an ID") })
  })

  /**
   * Start Match
   */
  socket.on(EClientEvent.START_MATCH, (callback) => {
    if (socket.session && users.has(socket.session)) {
      try {
        const table = getTable(socket.session)
        if (table && !table.lobby.gameLoop) {
          table.setState(EMatchTableState.STARTED)
          const game = table.lobby
            .startMatch()
            .onTurn(async (play) => {
              await getTableSockets(table, async (socket) => {
                socket.emit(EServerEvent.UPDATE_MATCH, table.getPublicMatch(socket.session))
              })

              const session = play.player?.session as string
              if (!session) {
                throw new Error("Unexpected Error")
              }
              const user = users.get(session)
              if (!user) {
                throw new Error("Unexpected Error")
              }
              await getTableSockets(
                table,
                (socket) =>
                  new Promise((resolve) => {
                    if (socket.session === session) {
                      socket.emit(EServerEvent.UPDATE_MATCH, table.getPublicMatch(session))
                      socket.on(EClientEvent.PLAY, () => {
                        resolve()
                      })
                    }
                  })
              )
            })
            .onTruco(async (play) => {})
            .onWinner(async () => {})
            .begin()

          emitMatchUpdate(table)
          return callback({ success: true, match: table.getPublicMatch(socket.session) })
        }
        console.error("ASL:KDJALSk")
        callback({ success: false, match: table.getPublicMatch(socket.session) })
      } catch (e) {
        console.error("ERROR", e)
        callback({ success: false, error: e })
      }
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
