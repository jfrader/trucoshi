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
  try {
    const data = readFileSync(__dirname + "/../../package.json", "utf8")
    const pkg = JSON.parse(data)
    version = pkg.version
  } catch (e) {
    logger.error(e, "Failed to read package.json")
    process.exit(1)
  }

  logger.info("Starting Trucoshi " + process.env.NODE_ENV + " server version " + version)

  const PORT = process.env.NODE_PORT || 2992
  const ORIGIN = process.env.NODE_ORIGIN || "http://localhost:2991"

  const server = Trucoshi({ port: Number(PORT), origin: [ORIGIN], serverVersion: version })

  server.listen((io) => {
    logger.info(`Listening on port ${PORT} accepting origin ${ORIGIN}`)

    io.use(session(server))
    io.use(trucoshi(server))

    const exitHandler = () => {
      if (server) {
        server.io.close(() => {
          logger.info("Server closed")
          process.exit(1)
        })
      } else {
        process.exit(1)
      }
    }

    const unexpectedErrorHandler = (error: unknown) => {
      logger.error(error)
      exitHandler()
    }

    process.on("uncaughtException", unexpectedErrorHandler)
    process.on("unhandledRejection", unexpectedErrorHandler)

    process.on("SIGTERM", () => {
      logger.info("SIGTERM received")
      if (server) {
        server.io.close()
      }
      process.exit()
    })
  })
}
