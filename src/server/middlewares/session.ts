import { ExtendedError } from "socket.io/dist/namespace"
import { ITrucoshi, TrucoshiSocket } from "../classes"
import logger from "../../utils/logger"
import { TMap } from "../../types"

export const session = (server: ITrucoshi) => {
  server.io.on("connection", (socket) => {
    logger.trace("New socket connection %s", socket.id)
    logger.info(socket.data.user, "New connection session")
    if (socket.data.user) {
      socket.join(socket.data.user.session)
      server.emitSocketSession(socket)
    }
  })

  return (socket: TrucoshiSocket, next: (err?: ExtendedError) => void) => {
    socket.on("disconnect", async (reason) => {
      logger.trace("Socket disconnected, reason?: %s", reason)
      if (socket.data.user) {
        const matchingSockets = await server.io.in(socket.data.user?.session).fetchSockets()
        const isDisconnected = matchingSockets.length === 0
        if (isDisconnected) {
          const userSession = server.sessions.get(socket.data.user.session)
          if (userSession) {
            userSession.setAccount(null)
            userSession.disconnect()
          }
        }
      }
    })

    const name = socket.handshake.auth.name
    const sessionID = socket.handshake.auth.sessionID
    if (sessionID) {
      const session = server.sessions.get(sessionID)
      if (session) {
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
