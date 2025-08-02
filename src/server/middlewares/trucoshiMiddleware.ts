import { ExtendedError } from "socket.io/dist/namespace"
import { ITrucoshi, SocketError, TrucoshiSocket, isSocketError } from "../classes"
import logger from "../../utils/logger"
import { getWordsId } from "../../utils/string/getRandomWord"
import { EClientEvent, EServerEvent } from "../../events"
import { PLAYER_LOBBY_TIMEOUT } from "../../constants"
import { PLAYER_ABANDON_TIMEOUT } from "../../lib"

const log = logger.child({ middleware: "trucoshiMiddleware" })

export const trucoshiMiddleware = (server: ITrucoshi) => {
  server.io.of("/").adapter.on("join-room", (room, socketId) => {
    const socket = server.io.sockets.sockets.get(socketId)

    if (room === "stats" && socket) {
      socket.emit(EServerEvent.UPDATE_STATS, server.stats)
    }

    if (room === "searching" && socket) {
      socket.emit(EServerEvent.UPDATE_PUBLIC_MATCHES, server.tables.getAll())
    }
  })

  server.io.on("connection", (socket) => {
    logger.info(
      `Socket ${socket.id} connected with name ${socket.data.user?.name}${
        socket.data.user?.account?.id ? ", account: " + socket.data.user.account.id : ""
      }`
    )
    if (socket.data.user) {
      socket.join(socket.data.user.session)
      server.emitSocketSession(socket)
    }
  })

  return (socket: TrucoshiSocket, next: (err?: ExtendedError) => void) => {
    socket.on(EClientEvent.PING, (clientTime) => {
      socket.emit(EServerEvent.PONG, Date.now(), clientTime)
    })

    socket.on("disconnect", async (reason) => {
      logger.debug(`Socket ${socket.id} disconnected, reason?: %s`, reason)
      if (socket.data.user) {
        const matchingSockets = await server.io.in(socket.data.user?.session).fetchSockets()
        const isDisconnected = matchingSockets.length === 0

        if (isDisconnected) {
          const user = socket.data.user
          const tables = server.tables.findAll((table) => !!table.isSessionPlaying(user.session))

          tables.forEach((table) => server.leaveMatch(table.matchSessionId, socket))

          const userSession = server.sessions.get(socket.data.user.session)
          if (userSession) {
            userSession.disconnect()
            userSession
              .waitReconnection(userSession.session, PLAYER_LOBBY_TIMEOUT, "disconnection")
              .catch(() => {
                userSession.disconnect()
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
                      if (server.tables.find((t) => !!t.isSessionPlaying(userSession.session))) {
                        return
                      }
                      server.sessions.delete(userSession.session)
                    }, PLAYER_ABANDON_TIMEOUT)
                  })
              })
          }
        }
      }
    })

    socket.on(EClientEvent.JOIN_ROOM, async (room) => {
      log.debug("Joining room %s", room)
      socket.join(room)
    })

    socket.on(EClientEvent.LEAVE_ROOM, async (room) => {
      log.debug("Leaving room %s", room)
      socket.leave(room)
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

        let matchSessionId = getWordsId()
        while (server.tables.get(matchSessionId)) {
          matchSessionId = getWordsId()
        }

        const table = await server.createMatchTable(matchSessionId, userSession)

        server.chat.create(matchSessionId)
        socket.join(matchSessionId)

        return callback({
          success: true,
          match: table.getPublicMatch(userSession.name),
          activeMatches: server.getSessionActiveMatches(userSession.session),
        })
      } catch (e) {
        log.error(e)
        return callback({ success: false, error: isSocketError(e) })
      }
    })

    /**
     * Set Match Options
     */
    socket.on(EClientEvent.SET_MATCH_OPTIONS, async (matchSessionId, options, callback) => {
      log.trace({ matchSessionId, options }, "Setting match options")
      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)
        const table = await server.setMatchOptions({
          identityJwt: socket.data.identity || "",
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
        callback({ success: false, error: isSocketError(e) })
      }
    })

    /**
     * Start Match
     */
    socket.on(EClientEvent.START_MATCH, async (matchSessionId, callback) => {
      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)

        log.trace(userSession.getPublicInfo(), "User starting match...")

        if (matchSessionId && userSession.ownedMatches.has(matchSessionId)) {
          log.trace("Server starting match...")
          await server.startMatch({
            identityJwt: socket.data.identity || "",
            matchSessionId,
            userSession,
          })
          return callback({ success: true, matchSessionId: matchSessionId })
        }
        log.trace({ matchId: matchSessionId }, "Match could not be started")
        throw new SocketError("FORBIDDEN")
      } catch (e) {
        log.error(e, "Client event START_MATCH error")
        callback({ success: false, error: isSocketError(e) })
      }
    })

    /**
     * Join Match
     */
    socket.on(EClientEvent.JOIN_MATCH, async (matchSessionId, teamIdx, callback) => {
      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)
        const table = server.tables.get(matchSessionId)

        log.trace(userSession.getPublicInfo(), "User joining match...")

        if (table) {
          const player = await server.joinMatch(
            table,
            userSession,
            socket.data.identity || null,
            teamIdx
          )

          socket.join(table.matchSessionId)
          socket.join(table.matchSessionId + player.teamIdx)
          socket.leave(table.matchSessionId + Number(!player.teamIdx))

          server.emitMatchUpdate(table).catch(console.error)
          return callback({
            success: true,
            match: table.getPublicMatch(userSession.session),
            activeMatches: server.getSessionActiveMatches(userSession.session),
          })
        }
        throw new SocketError("NOT_FOUND")
      } catch (e) {
        log.error(e, "Client event JOIN_MATCH error")
        callback({ success: false, error: isSocketError(e) })
      }
    })

    /**
     * Add Bot Player
     */
    socket.on(EClientEvent.ADD_BOT, async (matchSessionId, teamIdx, callback) => {
      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)
        const table = server.tables.get(matchSessionId)

        log.trace(userSession.getPublicInfo(), "User joining match...")

        if (table) {
          await server.addBot(table, userSession, teamIdx)

          socket.join(table.matchSessionId)

          server.emitMatchUpdate(table).catch(console.error)
          return callback({
            success: true,
            match: table.getPublicMatch(userSession.session),
          })
        }
        throw new SocketError("NOT_FOUND")
      } catch (e) {
        log.error(e, "Client event ADD_BOT error")
        callback({ success: false, error: isSocketError(e) })
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
        callback({ success: false, error: isSocketError(e) })
      }
    })

    /**
     * Leave Match
     */
    socket.on(EClientEvent.LEAVE_MATCH, async (matchId, callback) => {
      log.trace({ matchId, socketId: socket.id }, "Client emitted LEAVE_MATCH event")
      try {
        await server.leaveMatch(matchId, socket, true)
        callback?.({ success: true })
      } catch (e) {
        log.error(e, "Client event LEAVE_MATCH error")
        callback?.({ success: false, error: isSocketError(e) })
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
     * Get public ranking
     */
    socket.on(EClientEvent.LIST_RANKING, (filters = {}, callback) => {
      callback({ success: true, ranking: server.ranking })
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
        callback({ success: false, error: isSocketError(e) })
      }
    })

    /**
     * Fetch match with session
     */
    socket.on(EClientEvent.FETCH_MATCH, (matchSessionId, callback) => {
      if (!socket.data.user) {
        return callback({ success: false, match: null, error: new SocketError() })
      }

      const match = server.emitSocketMatch(socket, matchSessionId)

      callback({ success: Boolean(match), match })
    })

    /**
     * Fetch chat room
     */
    socket.on(EClientEvent.FETCH_CHAT_ROOM, (roomId) => {
      if (!socket.data.user) {
        return
      }

      server.chat.rooms.get(roomId)?.socket.emit(socket.id)
    })

    /**
     * Fetch match with session
     */
    socket.on(EClientEvent.KICK_PLAYER, async (matchSessionId, key, callback) => {
      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)
        await server.kickPlayer({ userSession, matchSessionId, key })
        callback({ success: true })
      } catch (e) {
        callback({ error: isSocketError(e), success: false })
      }
    })

    /**
     * Fetch match details
     */
    socket.on(EClientEvent.FETCH_MATCH_DETAILS, async (matchId, callback) => {
      try {
        if (!socket.data.user) {
          throw new SocketError("FORBIDDEN")
        }

        const match = await server.getMatchDetails(socket, matchId)
        callback({ success: true, match })
      } catch (e) {
        return callback({ success: false, match: null, error: isSocketError(e) })
      }
    })

    /**
     * Fetch account details
     */
    socket.on(EClientEvent.FETCH_ACCOUNT_DETAILS, async (accountId, callback) => {
      try {
        if (!socket.data.user) {
          throw new SocketError("FORBIDDEN")
        }

        const response = await server.getAccountDetails(socket, accountId)
        callback({ success: true, ...response })
      } catch (e) {
        callback({
          success: false,
          matches: [],
          stats: null,
          account: null,
          error: isSocketError(e),
        })
      }
    })

    next()
  }
}
