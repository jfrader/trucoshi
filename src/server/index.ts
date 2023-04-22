import logger from "../etc/logger"
import { Trucoshi } from "./classes"
import { trucoshiEvents } from "./middlewares"
import { readFileSync } from "fs"

export * from "./classes"
export * from "./constants"
export * from "./middlewares"

let version = ""

export default () => {
  process.on("unhandledRejection", (reason, promise) => {
    logger.fatal({ reason, promise }, "UNHANDLED REJECTION!")
  })

  process.on("uncaughtException", (reason, promise) => {
    logger.fatal({ reason, promise }, "UNCAUGHT EXCEPTION!")
  })

  try {
    const data = readFileSync(__dirname + "/../../package.json", "utf8")
    const pkg = JSON.parse(data)
    version = pkg.version
  } catch (e) {
    logger.error(e, "Failed to read package.json")
    process.exit(1)
  }

  logger.info("Starting Trucoshi server version " + version)

  const PORT = process.env.NODE_PORT || 4001
  const ORIGIN = process.env.NODE_ORIGIN || "http://localhost:3000"

  const server = Trucoshi({ port: Number(PORT), origin: [ORIGIN], serverVersion: version })

  server.listen((io) => {
    logger.info(`Listening on port ${PORT} accepting origin ${ORIGIN}`)

    io.use(trucoshiEvents(server))

    io.on("connection", (socket) => {
      logger.debug("New socket connection %s", socket.id)
      logger.info(socket.handshake.headers, "New socket handhshake")
    })
  })
}
