import logger from "../utils/logger"
import { Trucoshi } from "./classes"
import { readFileSync } from "fs"
import { createAdapter } from "@socket.io/redis-adapter"
import { createClient } from "redis"

export * from "./classes"
export * from "./constants"
export * from "./middlewares"

import * as dotenv from "dotenv"
import { trucoshi, session } from "./middlewares"

let version = ""

dotenv.config()

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

  logger.info("Starting Trucoshi " + process.env.NODE_ENV + " server version " + version)

  const PORT = process.env.NODE_PORT || 4001
  const ORIGIN = process.env.NODE_ORIGIN || "http://localhost:3000"

  const server = Trucoshi({ port: Number(PORT), origin: [ORIGIN], serverVersion: version })

  server.listen((io) => {
    logger.info(`Listening on port ${PORT} accepting origin ${ORIGIN}`)

    io.use(session(server))
    io.use(trucoshi(server))
  })
}
