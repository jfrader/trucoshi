import { randomUUID } from "crypto"
import { createServer } from "http"
import { Server } from "socket.io"
import { IGameLoop, Trucoshi } from "../lib"
import { IMatch, ITrucoshi } from "../lib/types"
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

const sessions = new Map<string, IUser>()
const tables = new Map<string, ITrucoshi>()
const matches = new Map<string, IGameLoop>()

io.on("connection", (_socket) => {
  const socket = _socket as TrucoshiSocket

  socket.on(EClientEvent.PING, (msg) => {
    socket.emit(EServerEvent.PONG, msg)
  })

  socket.on(EClientEvent.CREATE_MATCH, (callback) => {
    if (socket.user?.session) {
      const trucoshi = Trucoshi()
      tables.set(socket.user.session, trucoshi)
      return callback({ success: true })
    }
    callback({ success: false })
  })

  socket.on(EClientEvent.START_MATCH, () => {
    if (socket.user?.session) {
      const table = tables.get(socket.user?.session)
      if (table) {
        matches.set(socket.user.session, table.startMatch())
      }
    }
  })

  socket.on(EClientEvent.SET_SESSION, (session, id, callback) => {
    if (socket.user?.session) {
      socket.user.id = id
      return callback({ success: true })
    }
    const storedSession = sessions.get(session)
    if (storedSession) {
      storedSession.id = id
      socket.user = storedSession
      return callback({ success: true })
    }
    const newSession = randomUUID()
    socket.user = User(id, newSession)
    sessions.set(newSession, socket.user)
    return callback({ success: true, session: newSession })
  })
})

httpServer.listen(PORT)

console.log("Listening on port", PORT)
