import { ExtendedError } from "socket.io/dist/namespace"
import { ITrucoshi, SocketError, TrucoshiSocket, isSocketError } from "../classes"
import logger from "../../utils/logger"
import { TMap } from "../classes/TMap"
import { EClientEvent, EServerEvent } from "../../types"
import { validateJwt } from "../../accounts/client"
import { Event } from "socket.io"
import { PLAYER_LOBBY_TIMEOUT } from "../../constants"
import { PLAYER_ABANDON_TIMEOUT } from "../../lib"

export const sessionMiddleware = (server: ITrucoshi) => {
  server.io.on("connection", (socket) => {
    logger.trace("New socket connection %s", socket.id)
    if (socket.data.user) {
      socket.join(socket.data.user.session)
      server.emitSocketSession(socket)
    }
  })

  return (socket: TrucoshiSocket, next: (err?: ExtendedError) => void) => {
    socket.on("disconnect", async (reason) => {
      logger.debug("Socket disconnected, reason?: %s", reason)
      if (socket.data.user) {
        const matchingSockets = await server.io.in(socket.data.user?.session).fetchSockets()
        const isDisconnected = matchingSockets.length === 0
        if (isDisconnected) {
          const userSession = server.sessions.get(socket.data.user.session)
          if (userSession) {
            userSession.disconnect()
            userSession
              .waitReconnection(userSession.session, PLAYER_LOBBY_TIMEOUT, "disconnection")
              .catch(() => {
                server
                  .cleanupUserTables(userSession)
                  .catch((e) =>
                    logger.error(
                      { message: e.message },
                      "Failed to cleanup user tables after user disconnected and timed out"
                    )
                  )
                  .finally(() => {
                    setTimeout(() => {
                      server.sessions.delete(userSession.session)
                    }, PLAYER_ABANDON_TIMEOUT)
                  })
              })
          }
        }
      }
    })

    socket.use(validateSession(socket))

    socket.on("error", (err) => {
      logger.error(err, "Socket packet error")
      socket.disconnect()
    })

    const name = socket.handshake.auth.name
    const sessionID = socket.handshake.auth.sessionID
    const handshakeID = socket.handshake.auth.identity

    if (sessionID === "log") {
      return next(new SocketError("INVALID_IDENTITY"))
    }

    if (sessionID) {
      const userSession = server.sessions.get(sessionID)
      if (userSession) {
        if (userSession.account) {
          if (!validateJwt(handshakeID, userSession.account)) {
            return next(new SocketError("INVALID_IDENTITY"))
          }
        }
        userSession.reconnect(userSession.session)
        userSession.setName(name)
        socket.data.user = userSession.getUserData()
        socket.data.identity = handshakeID

        if (!socket.data.matches) {
          socket.data.matches = new TMap()
        }

        logger.debug("Socket %s connected to guest session %s", socket.id, sessionID)

        return next()
      }
    }

    const userSession = server.createUserSession(socket, name || "Satoshi")
    socket.data.user = userSession.getUserData()
    userSession.connect()

    logger.debug("Socket %s connected to NEW guest session %s", socket.id, sessionID)

    next()
  }
}

const NON_VALIDATED_EVENTS: string[] = [EClientEvent.LOGIN, EClientEvent.LOGOUT, EClientEvent.PING]

const validateSession: (
  socket: TrucoshiSocket,
  retry?: number
) => (event: Event, next: (err?: Error | undefined) => void) => void = (socket, retry = 0) => {
  return (event, next) => {
    logger.debug("Received event %s from socket %s", event[0], socket.id)
    if (NON_VALIDATED_EVENTS.includes(event[0])) {
      return next()
    }
    if (!retry) {
      logger.trace({ ...socket.data.user, event: event[0] }, "validating session")
    }
    if (socket.data.user?.account?.id) {
      try {
        if (!socket.data?.identity) {
          throw new SocketError("INVALID_IDENTITY", "Socket has account but no identity")
        }
        validateJwt(socket.data?.identity, socket.data.user?.account)
        return next()
      } catch (e) {
        if (retry < 3) {
          logger.trace({ ...socket.data.user, event: event[0] }, "refreshing identity")
          return socket.emit(
            EServerEvent.REFRESH_IDENTITY,
            socket.data.user.account.id,
            (identity) => {
              try {
                if (!identity) {
                  throw new SocketError("INVALID_IDENTITY", "Failed to refresh identity")
                }
                socket.data.identity = identity
                return validateSession(socket, retry + 1)(event, next)
              } catch (e) {
                return next(isSocketError(e, "INVALID_IDENTITY"))
              }
            }
          )
        }

        return next(isSocketError(e, "INVALID_IDENTITY"))
      }
    }

    return next()
  }
}
