import { ExtendedError } from "socket.io/dist/namespace"
import { ITrucoshi, SocketError, TrucoshiSocket, isSocketError } from "../classes"
import logger from "../../utils/logger"
import { TMap } from "../classes/TMap"
import { EClientEvent, EServerEvent, GAME_ERROR } from "../../types"
import { validateJwt } from "../../accounts/client"
import { Event } from "socket.io"

const log = logger.child({ middleware: "session" })

export const session = (server: ITrucoshi) => {
  server.io.on("connection", (socket) => {
    log.debug("New socket connection %s", socket.id)
    if (socket.data.user) {
      socket.join(socket.data.user.session)
      server.emitSocketSession(socket)
    }
  })

  return (socket: TrucoshiSocket, next: (err?: ExtendedError) => void) => {
    socket.on("disconnect", async (reason) => {
      log.debug("Socket disconnected, reason?: %s", reason)
      if (socket.data.user) {
        const matchingSockets = await server.io.in(socket.data.user?.session).fetchSockets()
        const isDisconnected = matchingSockets.length === 0
        if (isDisconnected) {
          const userSession = server.sessions.get(socket.data.user.session)
          if (userSession) {
            userSession.disconnect()
          }
        }
      }
    })

    socket.use(validateSession(socket))

    socket.on("error", (err) => {
      log.error(err, "Socket packet error")
      server.logout(socket)
      socket.disconnect()
    })

    const name = socket.handshake.auth.name
    const sessionID = socket.handshake.auth.sessionID

    if (sessionID) {
      const session = server.sessions.get(sessionID)
      if (session) {
        if (session.account) {
          return next(new SocketError("INVALID_IDENTITY"))
        }
        session.connect()
        session.setName(name)
        socket.data.user = session.getUserData()

        if (!socket.data.matches) {
          socket.data.matches = new TMap()
        }

        return next()
      }
    }

    const session = server.createUserSession(socket, name || "Satoshi")
    socket.data.user = session.getUserData()
    session.connect()

    next()
  }
}

const NON_VALIDATED_EVENTS: string[] = [EClientEvent.LOGIN, EClientEvent.LOGOUT, EClientEvent.PING]

const validateSession: (
  socket: TrucoshiSocket,
  retry?: boolean
) => (event: Event, next: (err?: Error | undefined) => void) => void = (socket, retry) => {
  return (event, next) => {
    if (NON_VALIDATED_EVENTS.includes(event[0])) {
      return next()
    }
    log.trace({ ...socket.data.user, event: event[0] }, "validating session")
    if (socket.data.user?.account?.id) {
      try {
        if (!socket.data?.identity) {
          throw new SocketError("INVALID_IDENTITY", "Socket has account but no identity")
        }
        validateJwt(socket.data?.identity, socket.data.user?.account)
        return next()
      } catch (e) {
        if (!retry) {
          log.trace({ ...socket.data.user, event: event[0] }, "refreshing identity")
          return socket.emit(
            EServerEvent.REFRESH_IDENTITY,
            socket.data.user.account.id,
            (identity) => {
              try {
                if (!identity) {
                  throw new SocketError("INVALID_IDENTITY", "Failed to refresh identity")
                }
                socket.data.identity = identity
                validateSession(socket, true)
                return next()
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
