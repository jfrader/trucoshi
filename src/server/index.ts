import logger from "../utils/logger"
import { Trucoshi } from "./classes"
import { readFileSync } from "fs"

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

  const PORT = process.env.APP_PORT || 2992
  const ORIGIN = process.env.APP_ORIGIN || "http://localhost:2991"

  const server = Trucoshi({ port: Number(PORT), origin: [ORIGIN], serverVersion: version })

  logger.info("Starting Trucoshi " + process.env.NODE_ENV + " server version " + version)

  server.listen((io) => {
    logger.info(`Listening on port ${PORT} accepting origin ${ORIGIN}`)

    io.use(session(server))
    io.use(trucoshi(server))

    process.on("uncaughtException", unexpectedErrorHandler)
    process.on("unhandledRejection", unexpectedErrorHandler)

    process.on("SIGTERM", () => {
      logger.info("SIGTERM received")
      exitHandler(0)
    })
  })

  const closeServer = (code: number = 0) => {
    server.io.close((e) => {
      if (e) {
        logger.error(e, "Failed to close server")
      } else {
        logger.info("Server closed")
      }
      process.exit(code || (e ? 1 : 0))
    })
  }

  const exitHandler = (code: number = 0) => {
    if (server) {
      if (server.store) {
        server.store
          ?.$disconnect()
          .then(() => {
            logger.info("Database closed")
            closeServer(code)
          })
          .catch((e) => {
            logger.error(e, "Failed to close database")
            closeServer(code || 1)
          })
      } else {
        closeServer(code)
      }
    } else {
      process.exit(code)
    }
  }

  const unexpectedErrorHandler = (error: unknown) => {
    logger.error(error)
    exitHandler(1)
  }
}
