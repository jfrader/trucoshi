import logger from "../etc/logger"
import { Trucoshi } from "./classes"
import { trucoshiEvents } from "./middlewares"

export * from "./classes"
export * from "./constants"
export * from "./middlewares"

export default () => {
  process.on("unhandledRejection", (reason, promise) => {
    logger.fatal({ reason, promise }, "UNHANDLED REJECTION!")
  })

  process.on("uncaughtException", (reason, promise) => {
    logger.fatal({ reason, promise }, "UNCAUGHT EXCEPTION!")
  })

  const PORT = process.env.NODE_PORT || 4001
  const ORIGIN = process.env.NODE_ORIGIN || "http://localhost:3000"
  const server = Trucoshi(Number(PORT), [ORIGIN])
  server.listen((io) => {
    logger.info(`Trucoshi server listening on port ${PORT} accepting origin ${ORIGIN}`)

    io.use(trucoshiEvents(server))

    io.on("connection", (socket) => {
      logger.debug("New socket connection %s", socket.id)
      logger.info(socket.handshake, "New socket handhshake")
    })
  })
}
