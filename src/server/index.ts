import { SocketServer, Trucoshi } from "./classes"
import { trucoshiEvents } from "./middlewares"

export * from "./classes"
export * from "./constants"
export * from "./middlewares"

export default () => {
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
}
