import { ExtendedError } from "socket.io/dist/namespace"
import {
  ITrucoshi,
  SocketError,
  TrucoshiSocket,
  isSocketError,
  toSocketMiddlewareError,
} from "../classes"
import logger from "../../utils/logger"
import { EClientEvent, EServerEvent } from "../../types"
import { validateJwt } from "../../accounts/client"
import { Event } from "socket.io"
import type { User } from "lightning-accounts"

const MAX_SESSION_ID_LENGTH = 256
const MAX_IDENTITY_LENGTH = 16 * 1024

const isBoundedString = (value: unknown, maxLength: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= maxLength

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isLoginUser = (value: unknown): value is User =>
  isRecord(value) && Number.isSafeInteger(value.id) && (value.id as number) > 0

const invalidIdentity = () => toSocketMiddlewareError(new SocketError("INVALID_IDENTITY"))

const safeErrorType = (error: unknown) => ({
  errorType:
    typeof error === "object" && error !== null && "name" in error && typeof error.name === "string"
      ? error.name
      : "UnknownError",
})

export const sessionMiddleware = (server: ITrucoshi) => {
  return (socket: TrucoshiSocket, next: (err?: ExtendedError) => void) => {
    socket.use(validateSession(socket))

    socket.on("error", (err) => {
      logger.error(safeErrorType(err), "Socket error")
      socket.disconnect()
    })

    const rawAuth = socket.handshake.auth
    const auth = isRecord(rawAuth) ? rawAuth : {}
    const name = typeof auth.name === "string" ? auth.name.trim().slice(0, 16) : ""
    const sessionID = isBoundedString(auth.sessionID, MAX_SESSION_ID_LENGTH)
      ? auth.sessionID
      : undefined
    const handshakeID = isBoundedString(auth.identity, MAX_IDENTITY_LENGTH)
      ? auth.identity
      : undefined
    const user = isLoginUser(auth.user) ? auth.user : undefined

    if (
      (auth.sessionID !== undefined &&
        auth.sessionID !== null &&
        auth.sessionID !== "" &&
        !sessionID) ||
      (auth.identity !== undefined &&
        auth.identity !== null &&
        auth.identity !== "" &&
        !handshakeID) ||
      (auth.user !== undefined && auth.user !== null && (!user || !handshakeID)) ||
      (handshakeID && !user && !sessionID)
    ) {
      return next(invalidIdentity())
    }

    if (sessionID === "log") {
      return next(invalidIdentity())
    }

    if (user && handshakeID) {
      return server
        .login({ account: user, identityJwt: handshakeID, socket })
        .then(() => {
          logger.debug(
            { socketId: socket.id, accountId: socket.data.user?.account?.id },
            "Socket connected to user session"
          )
          next()
        })
        .catch((e) => {
          next(toSocketMiddlewareError(e))
        })
    }

    if (sessionID) {
      const userSession = server.sessions.get(sessionID)
      if (userSession) {
        try {
          if (userSession.account) {
            if (!handshakeID) {
              throw new SocketError("INVALID_IDENTITY")
            }
            validateJwt(handshakeID, userSession.account)
          }
        } catch (e) {
          return next(toSocketMiddlewareError(isSocketError(e, "INVALID_IDENTITY")))
        }

        if (!userSession.account && name) {
          userSession.setName(name)
        }
        userSession.reconnect(userSession.session)
        socket.data.user = userSession.getUserData()
        socket.data.identity = handshakeID

        if (!socket.data.matches) {
          socket.data.matches = new Set()
        }

        logger.debug({ socketId: socket.id }, "Socket reconnected to session")

        return next()
      }
    }

    const userSession = server.createUserSession(socket, name || "Satoshi")
    socket.data.user = userSession.getUserData()
    userSession.connect()

    logger.debug({ socketId: socket.id }, "Socket connected to new guest session")

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
      logger.trace(
        { socketId: socket.id, accountId: socket.data.user?.account?.id, event: event[0] },
        "validating session"
      )
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
          logger.trace(
            {
              socketId: socket.id,
              accountId: socket.data.user.account.id,
              event: event[0],
            },
            "refreshing identity"
          )
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
