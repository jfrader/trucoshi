import { randomUUID } from "crypto"
import { MatchTable } from "./classes/MatchTable"
import { EClientEvent, EServerEvent } from "../types"
import { Trucoshi } from "./classes/Trucoshi"
import { SocketServer } from "./classes/SocketServer"
import { trucoshiEvents } from "./middlewares/trucoshiEvents"

const PORT = process.env.NODE_PORT || 4001
const ORIGIN = process.env.NODE_ORIGIN || "http://localhost:3000"

const server = SocketServer(Trucoshi(), Number(PORT), [ORIGIN])

server.listen((io) => {
  console.log("Listening on", PORT, " from origin at", ORIGIN)

  io.use(trucoshiEvents(server))

  io.on("connection", (socket) => {
    console.log("New socket", socket.id)
  })
})
