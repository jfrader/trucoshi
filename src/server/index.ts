import { Trucoshi } from "./classes"
import { readFileSync } from "fs"

export * from "./classes"
export * from "../constants"
export * from "./middlewares"
export * from "./config"
export * from "./RuntimeHealth"
export * from "./RuntimeOps"

import * as dotenv from "dotenv"
import { trucoshiMiddleware, sessionMiddleware } from "./middlewares"
import logger from "../utils/logger"
import { getServerPort } from "./config"

let version = ""

dotenv.config()

const log = logger.child({ middleware: "sessionMiddleware" })

export default () => {
  try {
    const data = readFileSync(__dirname + "/../../package.json", "utf8")
    const pkg = JSON.parse(data)
    version = process.env.RENDER_GIT_COMMIT || pkg.version
  } catch (e) {
    log.error(e, "Failed to read package.json")
    process.exit(1)
  }

  const port = getServerPort()
  const ORIGIN = process.env.APP_ORIGIN || "http://localhost:2991"

  const server = Trucoshi({ port, origin: ORIGIN.split(","), serverVersion: version })

  log.info("Starting Trucoshi " + process.env.NODE_ENV + " server version " + version)

  let shutdownPromise: Promise<void> | undefined

  const shutdown = (code: number, reason: string) => {
    server.markDraining()
    if (shutdownPromise) {
      return shutdownPromise
    }

    log.info({ reason }, "Shutting down Trucoshi")
    shutdownPromise = server
      .close()
      .then(() => {
        log.info("Server closed")
        process.exit(code)
      })
      .catch((error) => {
        log.error(error, "Failed to close server cleanly")
        process.exit(code || 1)
      })
    return shutdownPromise
  }

  const unexpectedErrorHandler = (error: unknown) => {
    log.error(error)
    void shutdown(1, "unexpected error")
  }

  process.once("uncaughtException", unexpectedErrorHandler)
  process.once("unhandledRejection", unexpectedErrorHandler)
  process.once("SIGTERM", () => {
    log.info("SIGTERM received")
    void shutdown(0, "SIGTERM")
  })
  process.once("SIGINT", () => {
    log.info("SIGINT received")
    void shutdown(0, "SIGINT")
  })

  void server
    .listen((io) => {
      io.use(sessionMiddleware(server))
      io.use(trucoshiMiddleware(server))
      log.info(`Listening on port ${port} accepting origin ${ORIGIN}`)
    })
    .catch(unexpectedErrorHandler)

  return server
}
