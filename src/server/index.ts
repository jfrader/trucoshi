import { Trucoshi } from "./classes"
import { readFileSync } from "fs"

export * from "./classes"
export * from "../constants"
export * from "./middlewares"

import * as dotenv from "dotenv"
import { trucoshiMiddleware, sessionMiddleware } from "./middlewares"
import logger from "../utils/logger"

let version = ""

dotenv.config()

const log = logger.child({ middleware: "sessionMiddleware" })

export default () => {
  try {
    const data = readFileSync(__dirname + "/../../package.json", "utf8")
    const pkg = JSON.parse(data)
    version = pkg.version
  } catch (e) {
    log.error(e, "Failed to read package.json")
    process.exit(1)
  }

  const PORT = process.env.APP_PORT || 2992
  const ORIGIN = process.env.APP_ORIGIN || "http://localhost:2991"

  const server = Trucoshi({ port: Number(PORT), origin: ORIGIN.split(","), serverVersion: version })

  log.info("Starting Trucoshi " + process.env.NODE_ENV + " server version " + version)

  server.listen((io) => {
    log.info(`Listening on port ${PORT} accepting origin ${ORIGIN}`)

    io.use(sessionMiddleware(server))
    io.use(trucoshiMiddleware(server))

    process.on("uncaughtException", unexpectedErrorHandler)
    process.on("unhandledRejection", unexpectedErrorHandler)

    process.on("SIGTERM", () => {
      log.info("SIGTERM received")
      exitHandler(0)
    })
  })

  const closeServer = (code: number = 0) => {
    server.io.close((e) => {
      if (e) {
        log.error(e, "Failed to close server")
      } else {
        log.info("Server closed")
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
            log.info("Database closed")
            closeServer(code)
          })
          .catch((e) => {
            log.error(e, "Failed to close database")
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
    log.error(error)
    exitHandler(1)
  }
}
