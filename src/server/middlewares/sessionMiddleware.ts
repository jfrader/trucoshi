import { ExtendedError } from "socket.io/dist/namespace"
import { ITrucoshi, SocketError, TrucoshiSocket, isSocketError } from "../classes"
import logger from "../../utils/logger"
import { TMap } from "../classes/TMap"
import { EClientEvent, EServerEvent } from "../../types"
import { validateJwt } from "../../accounts/client"
import { Event } from "socket.io"

export const sessionMiddleware = (server: ITrucoshi) => {
  return (socket: TrucoshiSocket, next: (err?: ExtendedError) => void) => {
    socket.use(validateSession(socket))

    socket.on("error", (err) => {
      logger.error(err, "Socket packet error")
      socket.disconnect()
    })

    const name = `${socket.handshake.auth.name}`.slice(0, 16)
    const sessionID = socket.handshake.auth.sessionID
    const handshakeID = socket.handshake.auth.identity
    const user = socket.handshake.auth.user

    if (sessionID === "log") {
      return next(new SocketError("INVALID_IDENTITY"))
    }

    if (user && handshakeID) {
      return server
        .login({ account: user, identityJwt: handshakeID, socket })
        .then(() => {
          logger.debug("Socket %s connected to user session %s", socket.id, sessionID)
          next()
        })
        .catch((e) => {
          next(isSocketError(e))
        })
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

    logger.debug("Socket %s connected to new guest session %s", socket.id, sessionID)

    next()
  }
}

const NON_VALIDATED_EVENTS: string[] = [EClientEvent.LOGOUT, EClientEvent.PING]

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
                if (identity) {
                  socket.data.identity = identity
                }
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
