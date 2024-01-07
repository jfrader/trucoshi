import { ExtendedError } from "socket.io/dist/namespace"
import { ITrucoshi, MatchTable, TrucoshiSocket } from "../classes"
import { EClientEvent, EServerEvent } from "../../types"
import { randomUUID } from "crypto"
import logger from "../../utils/logger"

export const trucoshi =
  (server: ITrucoshi) => (socket: TrucoshiSocket, next: (err?: ExtendedError) => void) => {
    socket.on(EClientEvent.PING, (clientTime) => {
      socket.emit(EServerEvent.PONG, Date.now(), clientTime)
    })

    /**
     * Create Match
     */
    socket.on(EClientEvent.CREATE_MATCH, async (callback) => {
      try {
        if (!socket.data.user) {
          throw new Error("Attempted to create a match without a session")
        }
        const userSession = server.sessions.getOrThrow(socket.data.user.session)

        if (!userSession) {
          throw new Error("Attempted to create a match without a user")
        }

        logger.debug(userSession.getPublicInfo(), "User creating new match...")

        const matchId = randomUUID().substring(0, 8)
        const table = MatchTable(matchId, socket.data.user.session)

        logger.trace(userSession.getPublicInfo(), "User has created a new match table", table)

        userSession.ownedMatches.add(matchId)

        await table.lobby.addPlayer(
          userSession.key,
          userSession.account?.name || userSession.name,
          userSession.session,
          0,
          true
        )

        server.chat.create(matchId)
        socket.join(matchId)
        server.tables.set(matchId, table)

        return callback({
          success: true,
          match: table.getPublicMatch(userSession.name),
          activeMatches: server.getSessionActiveMatches(userSession.session),
        })
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
        const user = server.sessions.getOrThrow(socket.data.user?.session)

        logger.debug(user.getPublicInfo(), "User starting match...")

        if (matchId && user.ownedMatches.has(matchId)) {
          logger.trace("Server starting match...")
          await server.startMatch(matchId)
          return callback({ success: true, matchSessionId: matchId })
        }
        logger.trace({ matchId }, "Match could not be started")
        callback({ success: false })
      } catch (e) {
        logger.error(e)
        callback({ success: false })
      }
    })

    /**
     * Join Match
     */
    socket.on(EClientEvent.JOIN_MATCH, async (matchSessionId, teamIdx, callback) => {
      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)
        const table = server.tables.get(matchSessionId)

        logger.info(userSession.getPublicInfo(), "User joining match...")

        if (table) {
          await table.lobby.addPlayer(
            userSession.key,
            userSession.account?.name || userSession.name,
            userSession.session,
            teamIdx,
            userSession.ownedMatches.has(matchSessionId)
          )
          socket.join(table.matchSessionId)

          server.emitMatchUpdate(table).catch(console.error)
          return callback({
            success: true,
            match: table.getPublicMatch(userSession.session),
            activeMatches: server.getSessionActiveMatches(userSession.session),
          })
        }
        throw new Error("Table not found")
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
     * Login
     */
    socket.on(EClientEvent.LOGIN, (account, identityJwt, callback) => {
      try {
        server.login(socket, account, identityJwt, ({ success }) => {
          callback({
            success,
            activeMatches: server.getSessionActiveMatches(socket.data.user?.session),
          })
        })
      } catch (e) {
        logger.warn(e)
        callback({ success: false })
      }
    })

    /**
     * Logout
     */
    socket.on(EClientEvent.LOGOUT, (callback) => {
      server.logout(socket, callback)
    })

    /**
     * Fetch match with session
     */
    socket.on(EClientEvent.FETCH_MATCH, (matchId, callback) => {
      if (!socket.data.user) {
        return callback({ success: false, match: null })
      }

      server.chat.rooms.get(matchId)?.socket.emit(socket.id)
      const match = server.emitSocketMatch(socket, matchId)

      callback({ success: Boolean(match), match })
      server.chat.rooms.get(matchId)?.socket.emit(socket.id)
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
          return callback({ success: true, match: table.getPublicMatch(socket.data.user?.session) })
        }
        throw new Error("Player not found " + socket.data.user.name)
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
      server.leaveMatch(matchId, socket.id).then().catch(console.error)
    })

    next()
  }
