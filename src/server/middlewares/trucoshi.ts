import { randomUUID } from "crypto"
import { ExtendedError } from "socket.io/dist/namespace"
import { EClientEvent, EServerEvent } from "../../types"
import { ITrucoshi, MatchTable, TrucoshiSocket } from "../classes"
import logger from "../../etc/logger"

export const trucoshi =
  (server: ITrucoshi) => (socket: TrucoshiSocket, next: (err?: ExtendedError) => void) => {
    socket.on("disconnect", (reason) => {
      logger.info("Socket disconnected, reason?: %s", reason)
      try {
        const user = server.users.getOrThrow(socket.data.user?.session)
        if (user) {
          // user.disconnect() // should disconnect only if all sockets disconnected
        }
      } catch (e) {
        // noop
      }
    })

    socket.on(EClientEvent.PING, (msg) => {
      socket.emit(EServerEvent.PONG, msg)
    })

    /**
     * Create Match
     */
    socket.on(EClientEvent.CREATE_MATCH, async (callback) => {
      try {
        if (!socket.data.user) {
          throw new Error("Attempted to create a match without a session")
        }
        const user = server.users.getOrThrow(socket.data.user.session)

        if (!user) {
          throw new Error("Attempted to create a match without a user")
        }

        logger.debug(user.getPublicUser(), "User creating new match...")

        const matchId = randomUUID()
        const table = MatchTable(matchId, socket.data.user.session)

        logger.trace(user.getPublicUser(), "User has created a new match table", table)

        user.ownedMatches.add(matchId)

        await table.lobby.addPlayer(user.key, user.id, socket.data.user.session, 0, true)

        server.chat.create(matchId)
        socket.join(matchId)
        server.tables.set(matchId, table)

        return callback({ success: true, match: table.getPublicMatch(user.id) })
      } catch (e) {
        logger.warn(e)
        return callback({ success: false })
      }
    })

    /**
     * Start Match
     */
    socket.on(EClientEvent.START_MATCH, async (matchId, callback) => {
      try {
        const user = server.users.getOrThrow(socket.data.user?.session)

        logger.debug(user.getPublicUser(), "User starting match...")

        if (matchId && user.ownedMatches.has(matchId)) {
          logger.trace("Server starting match...")
          await server.startMatch(matchId)
          return callback({ success: true, matchSessionId: matchId })
        }
        logger.trace({ matchId }, "Match could not be started")
        callback({ success: false })
      } catch (e) {
        logger.warn(e)
        callback({ success: false })
      }
    })

    /**
     * Join Match
     */
    socket.on(EClientEvent.JOIN_MATCH, async (matchSessionId, teamIdx, callback) => {
      try {
        const user = server.users.getOrThrow(socket.data.user?.session)
        const table = server.tables.get(matchSessionId)

        logger.debug(user.getPublicUser(), "User joining match...")

        if (table) {
          await table.lobby.addPlayer(
            user.key,
            user.id,
            user.session,
            teamIdx,
            user.ownedMatches.has(matchSessionId)
          )
          socket.join(table.matchSessionId)

          server.emitMatchUpdate(table, []).catch(console.error)
          return callback({
            success: true,
            match: table.getPublicMatch(socket.data.user?.session),
          })
        }
        callback({ success: false })
      } catch (e) {
        logger.warn(e)
        callback({ success: false })
      }
    })

    /**
     * Get public matches
     */
    socket.on(EClientEvent.LIST_MATCHES, (filters = {}, callback) => {
      const publicMatches = server.tables.getAll(filters)
      callback({ success: true, matches: publicMatches })
    })

    /**
     * Set Session
     */
    socket.on(EClientEvent.SET_SESSION, (id, session, callback = () => {}) => {
      server.setOrGetSession(socket, id, session, ({ success, session, serverVersion }) => {
        if (session && success) {
          const activeMatches = server.getSessionActiveMatches(session)
          return callback({ success, serverVersion, session, activeMatches })
        }
        callback({ success, serverVersion, session, activeMatches: [] })
      })
    })

    /**
     * Fetch match with session
     */
    socket.on(EClientEvent.FETCH_MATCH, (session, matchId, callback) => {
      return server.setOrGetSession(socket, null, session, ({ success }) => {
        if (!success) {
          return callback({ success: false })
        }

        server.chat.rooms.get(matchId)?.emit()
        const match = server.emitSocketMatch(socket, matchId)

        callback({ success: Boolean(match) })
      })
    })

    /**
     * Set Player Ready
     */
    socket.on(EClientEvent.SET_PLAYER_READY, (matchId, ready, callback) => {
      try {
        if (!socket.data.user) {
          throw new Error("Session not found")
        }

        const table = server.tables.getOrThrow(matchId)
        const player = table.lobby.players.find(
          (player) => player && player.session === socket.data.user?.session
        )
        if (player) {
          player.setReady(ready)
          server.emitMatchUpdate(table, [socket.id]).catch(console.error)
          callback({ success: true, match: table.getPublicMatch(socket.data.user?.session) })
        }
      } catch (e) {
        logger.warn(e)
        callback({ success: false })
      }
    })

    /**
     * Leave Match
     */
    socket.on(EClientEvent.LEAVE_MATCH, (matchId) => {
      logger.trace({ matchId, socketId: socket.id }, "Client emitted LEAVE_MATCH event")
      server.leaveMatch(matchId, socket.id, true).then().catch(console.error)
    })

    next()
  }
