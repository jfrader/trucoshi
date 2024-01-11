import { ExtendedError } from "socket.io/dist/namespace"
import { ITrucoshi, TrucoshiSocket } from "../classes"
import { EClientEvent, EServerEvent } from "../../types"
import logger from "../../utils/logger"
import { getWordsId } from "../../utils/string/getRandomWord"

const log = logger.child({ middleware: "trucoshi" })

export const trucoshi =
  (server: ITrucoshi) => (socket: TrucoshiSocket, next: (err?: ExtendedError) => void) => {
    socket.on(EClientEvent.PING, (clientTime) => {
      socket.emit(EServerEvent.PONG, Date.now(), clientTime)
    })

    socket.on("disconnect", async () => {
      if (socket.data.user) {
        const user = socket.data.user
        const tables = server.tables.findAll((table) => !!table.isSessionPlaying(user.session))

        tables.forEach((table) => server.leaveMatch(table.matchSessionId, socket))
      }
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

        log.debug(userSession.getPublicInfo(), "User creating new match...")

        let matchSessionId = getWordsId()
        while (server.tables.get(matchSessionId)) {
          matchSessionId = getWordsId()
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
     * Set Match Options
     */
    socket.on(
      EClientEvent.SET_MATCH_OPTIONS,
      async (identityJwt, matchSessionId, options, callback) => {
        log.error({ identityJwt, options }, "SETTING MATCH OPTIONS")
        try {
          const userSession = server.sessions.getOrThrow(socket.data.user?.session)
          const table = await server.setMatchOptions({
            identityJwt,
            matchSessionId,
            userSession,
            options,
          })

          server.emitMatchUpdate(table, [socket.id]).catch(log.error)
          callback({
            success: true,
            match: table.getPublicMatch(userSession.session),
            activeMatches: server.getSessionActiveMatches(userSession.session),
          })
        } catch (e) {
          log.error(e, "Client event SET_MATCH_OPTIONS error")
          callback({ success: false })
        }
      }
    )

    /**
     * Start Match
     */
    socket.on(EClientEvent.START_MATCH, async (identityJwt, matchSessionId, callback) => {
      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)

        log.debug(userSession.getPublicInfo(), "User starting match...")

        if (matchSessionId && userSession.ownedMatches.has(matchSessionId)) {
          log.trace("Server starting match...")
          await server.startMatch({ identityJwt, matchSessionId, userSession })
          return callback({ success: true, matchSessionId: matchSessionId })
        }
        log.trace({ matchId: matchSessionId }, "Match could not be started")
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
    socket.on(EClientEvent.SET_PLAYER_READY, async (matchSessionId, ready, callback) => {
      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)
        const table = await server.setMatchPlayerReady({
          matchSessionId,
          ready,
          userSession,
        })
        callback({
          success: true,
          match: table.getPublicMatch(userSession.session),
        })
      } catch (e) {
        log.error(e, "Client event SET_PLAYER_READY error")
        callback({ success: false })
      }
    })

    /**
     * Leave Match
     */
    socket.on(EClientEvent.LEAVE_MATCH, async (matchId) => {
      log.trace({ matchId, socketId: socket.id }, "Client emitted LEAVE_MATCH event")
      try {
        server.leaveMatch(matchId, socket)
      } catch (e) {
        log.error(e, "Client event LEAVE_MATCH error")
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
    socket.on(EClientEvent.LOGIN, async (account, identityJwt, callback) => {
      try {
        await server.login({ socket, account, identityJwt })
        callback({
          success: true,
          activeMatches: server.getSessionActiveMatches(socket.data.user?.session),
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
      try {
        server.logout(socket)
        callback({
          success: true,
        })
      } catch (e) {
        log.error(e, "Client event LOGOUT error")
        callback({ success: false })
      }
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
