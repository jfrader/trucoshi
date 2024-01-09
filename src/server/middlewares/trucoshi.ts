import { ExtendedError } from "socket.io/dist/namespace"
import { ITrucoshi, MatchTable, TrucoshiSocket } from "../classes"
import { EClientEvent, EServerEvent } from "../../types"
import { randomUUID } from "crypto"
import logger from "../../utils/logger"

const log = logger.child({ middleware: "trucoshi" })

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

        log.trace(userSession.getPublicInfo(), "User creating new match...")

        let matchSessionId = randomUUID().substring(0, 8)

        while (server.tables.get(matchSessionId)) {
          matchSessionId = randomUUID().substring(0, 8)
        }

        const table = await server.createMatchTable(matchSessionId, userSession)

        server.chat.create(matchSessionId)
        socket.join(matchSessionId)
        server.tables.set(matchSessionId, table)

        return callback({
          success: true,
          match: table.getPublicMatch(userSession.name),
          activeMatches: server.getSessionActiveMatches(userSession.session),
        })
      } catch (e) {
        log.error(e)
        return callback({ success: false })
      }
    })

    /**
     * Start Match
     */
    socket.on(EClientEvent.START_MATCH, async (matchId, callback) => {
      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)

        log.trace(userSession.getPublicInfo(), "User starting match...")

        if (matchId && userSession.ownedMatches.has(matchId)) {
          log.silent("Server starting match...")
          await server.startMatch(matchId, userSession)
          return callback({ success: true, matchSessionId: matchId })
        }
        log.silent({ matchId }, "Match could not be started")
        callback({ success: false })
      } catch (e) {
        log.error(e, "Client event START_MATCH error")
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

        log.info(userSession.getPublicInfo(), "User joining match...")

        if (table) {
          await server.joinMatch(table, userSession, teamIdx)

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
        log.error(e, "Client event JOIN_MATCH error")
        callback({ success: false })
      }
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
        log.error(e, "Client event SET_PLAYER_READY error")
        callback({ success: false })
      }
    })

    /**
     * Leave Match
     */
    socket.on(EClientEvent.LEAVE_MATCH, (matchId) => {
      log.silent({ matchId, socketId: socket.id }, "Client emitted LEAVE_MATCH event")
      server
        .leaveMatch(matchId, socket.id)
        .then()
        .catch((e) => log.error(e, "Client event LEAVE_MATCH error"))
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
        log.error(e, "Client event LOGIN error")
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

    next()
  }
