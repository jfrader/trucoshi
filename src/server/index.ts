import { createServer } from "http"
import { Server } from "socket.io"
import { EClientEvent, EServerEvent } from "./types"

const PORT = 4001

const httpServer = createServer()
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
})

const sessions = new Map<string, string>()

io.on("connection", (socket) => {
  socket.on(EClientEvent.PING, (msg) => {
    io.emit(EServerEvent.PONG, msg)
  })

  socket.on(EClientEvent.CREATE_MATCH, (msg) => {

  })
  
  socket.on(EClientEvent.SET_PLAYER_ID, (msg) => {
    if (typeof msg === 'string' && msg.length < 32) {
    }
  })
})

httpServer.listen(PORT)

console.log("Listening on port", PORT)
