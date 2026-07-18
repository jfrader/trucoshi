import { ExtendedError } from "socket.io/dist/namespace"
import { ITrucoshi, SocketError, TrucoshiSocket, isSocketError } from "../classes"
import logger, { safeErrorDetails } from "../../utils/logger"
import { EClientEvent, EServerEvent } from "../../events"
import { PLAYER_LOBBY_TIMEOUT } from "../../constants"
import { PLAYER_ABANDON_TIMEOUT } from "../../lib"
import { getOpponentTeam } from "../../lib/utils"
import { assertMatchListFilters, assertStringIdentifier } from "../InputValidation"

const log = logger.child({ middleware: "trucoshiMiddleware" })
const CLIENT_SUBSCRIPTION_ROOMS = new Set(["stats", "searching"])

const isClientSubscriptionRoom = (room: unknown): room is string =>
  typeof room === "string" && CLIENT_SUBSCRIPTION_ROOMS.has(room)

const canAccessMatchRoom = (server: ITrucoshi, socket: TrucoshiSocket, roomId: unknown) => {
  if (typeof roomId !== "string" || !socket.data.user) {
    return false
  }
  try {
    assertStringIdentifier(roomId, "matchSessionId")
  } catch {
    return false
  }
  return (
    Boolean(server.sessions.get(socket.data.user.session)) &&
    Boolean(server.tables.get(roomId)) &&
    socket.rooms.has(roomId)
  )
}

const hasRequiredAck = (socket: TrucoshiSocket, event: EClientEvent, callback: unknown) => {
  if (typeof callback === "function") {
    return true
  }
  log.warn(
    { socketId: socket.id, event, callbackType: typeof callback },
    "Client event rejected: acknowledgement callback is required"
  )
  return false
}

const hasOptionalAck = (socket: TrucoshiSocket, event: EClientEvent, callback: unknown) => {
  if (callback === undefined || typeof callback === "function") {
    return true
  }
  log.warn(
    { socketId: socket.id, event, callbackType: typeof callback },
    "Client event rejected: acknowledgement callback is invalid"
  )
  return false
}

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
      { socketId: socket.id, accountId: socket.data.user?.account?.id },
      "Socket connected"
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
      logger.info(
        { socketId: socket.id, accountId: socket.data.user?.account?.id, reason },
        "Socket disconnected"
      )
      if (socket.data.user) {
        const matchingSockets = await server.io.in(socket.data.user?.session).fetchSockets()
        const isDisconnected = "length" in matchingSockets && matchingSockets.length === 0

        if (isDisconnected) {
          const user = socket.data.user
          const tables = server.tables.findAll((table) => !!table.isSessionPlaying(user.session))

          tables.forEach((table) => server.leaveMatch(table.matchSessionId, socket))

          const userSession = server.sessions.get(socket.data.user.session)
          if (userSession) {
            server
              .leaveQueue(userSession)
              .catch((e) => logger.error(safeErrorDetails(e), "Failed to leave match queue"))
            userSession.disconnect()
            userSession
              .waitReconnection(userSession.session, PLAYER_LOBBY_TIMEOUT, "disconnection")
              .catch(() => {
                userSession.disconnect()
                server
                  .cleanupUserTables(userSession)
                  .catch((e) =>
                    logger.error(
                      safeErrorDetails(e),
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
      if (!isClientSubscriptionRoom(room)) {
        log.warn({ socketId: socket.id, roomType: typeof room }, "Client JOIN_ROOM rejected")
        return
      }
      log.debug("Joining room %s", room)
      socket.join(room)
    })

    socket.on(EClientEvent.LEAVE_ROOM, async (room) => {
      if (!isClientSubscriptionRoom(room)) {
        log.warn({ socketId: socket.id, roomType: typeof room }, "Client LEAVE_ROOM rejected")
        return
      }
      log.debug("Leaving room %s", room)
      socket.leave(room)
    })

    /**
     * Join matchmaking queue
     */
    socket.on(EClientEvent.JOIN_QUEUE, async (options, callback) => {
      if (!hasRequiredAck(socket, EClientEvent.JOIN_QUEUE, callback)) return
      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)
        const status = await server.joinQueue({ socket, userSession, options })
        callback({ success: true, status })
      } catch (e) {
        log.error(e, "Client event JOIN_QUEUE error")
        callback({ success: false, error: isSocketError(e) })
      }
    })

    /**
     * Leave matchmaking queue
     */
    socket.on(EClientEvent.LEAVE_QUEUE, async (callback) => {
      if (!hasOptionalAck(socket, EClientEvent.LEAVE_QUEUE, callback)) return
      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)
        await server.leaveQueue(userSession)
        callback?.({ success: true })
      } catch (e) {
        log.error(e, "Client event LEAVE_QUEUE error")
        callback?.({ success: false, error: isSocketError(e) })
      }
    })

    /**
     * Create Match
     */
    socket.on(EClientEvent.CREATE_MATCH, async (callback) => {
      if (!hasRequiredAck(socket, EClientEvent.CREATE_MATCH, callback)) return
      try {
        if (!socket.data.user) {
          throw new Error("Attempted to create a match without a session")
        }
        const userSession = server.sessions.getOrThrow(socket.data.user.session)

        if (!userSession) {
          throw new Error("Attempted to create a match without a user")
        }

        log.trace(userSession.getPublicInfo(), "User creating new match...")

        const table = await server.createMatchTable(userSession, socket)

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
      if (!hasRequiredAck(socket, EClientEvent.SET_MATCH_OPTIONS, callback)) return
      log.trace({ matchSessionId, options }, "Setting match options")
      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)
        const table = await server.setMatchOptions({
          socket,
          matchSessionId,
          userSession,
          options,
        })

        server
          .emitMatchUpdate(table, [socket.id])
          .catch((e) => log.error(e, "Failed to emit match update after options change"))
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
      if (!hasRequiredAck(socket, EClientEvent.START_MATCH, callback)) return
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
      if (!hasRequiredAck(socket, EClientEvent.JOIN_MATCH, callback)) return
      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)
        const table = server.tables.get(matchSessionId)

        log.trace(userSession.getPublicInfo(), "User joining match...")

        if (table) {
          await server.joinMatch(table, userSession, socket, teamIdx)

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
      if (!hasRequiredAck(socket, EClientEvent.ADD_BOT, callback)) return
      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)
        const table = server.tables.get(matchSessionId)

        log.trace(userSession.getPublicInfo(), "User joining match...")

        if (table) {
          await server.addBot(table, userSession, teamIdx)

          socket.join(table.matchSessionId)

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
      if (!hasRequiredAck(socket, EClientEvent.SET_PLAYER_READY, callback)) return
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
      if (!hasOptionalAck(socket, EClientEvent.LEAVE_MATCH, callback)) return
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
      if (!hasRequiredAck(socket, EClientEvent.LIST_MATCHES, callback)) return
      try {
        assertMatchListFilters(filters)
        const publicMatches = server.tables.getAll(filters)
        callback({ success: true, matches: publicMatches })
      } catch (e) {
        callback({ success: false, matches: [], error: isSocketError(e) })
      }
    })

    /**
     * Get public ranking
     */
    socket.on(EClientEvent.LIST_RANKING, (filters = {}, callback) => {
      if (!hasRequiredAck(socket, EClientEvent.LIST_RANKING, callback)) return
      callback({ success: true, ranking: server.ranking })
    })

    /**
     * Logout
     */
    socket.on(EClientEvent.LOGOUT, (callback) => {
      if (!hasRequiredAck(socket, EClientEvent.LOGOUT, callback)) return
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
      if (!hasRequiredAck(socket, EClientEvent.FETCH_MATCH, callback)) return
      try {
        assertStringIdentifier(matchSessionId, "matchSessionId")
      } catch {
        return callback({ success: false, match: null, error: new SocketError() })
      }
      if (!socket.data.user || !server.sessions.get(socket.data.user.session)) {
        return callback({ success: false, match: null, error: new SocketError() })
      }

      const match = server.emitSocketMatch(socket, matchSessionId)

      callback({ success: Boolean(match), match })
    })

    /**
     * Fetch chat room
     */
    socket.on(EClientEvent.FETCH_CHAT_ROOM, (roomId) => {
      if (!canAccessMatchRoom(server, socket, roomId)) {
        log.warn(
          {
            socketId: socket.id,
            roomIdLength: typeof roomId === "string" ? roomId.length : undefined,
          },
          "FETCH_CHAT_ROOM rejected"
        )
        return
      }

      server.chat.rooms.get(roomId)?.socket.emit(socket.id)
    })

    /**
     * Fetch match with session
     */
    socket.on(EClientEvent.KICK_PLAYER, async (matchSessionId, key, callback) => {
      if (!hasRequiredAck(socket, EClientEvent.KICK_PLAYER, callback)) return
      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)
        await server.kickPlayer({ userSession, matchSessionId, key })
        callback({ success: true })
      } catch (e) {
        callback({ error: isSocketError(e), success: false })
      }
    })

    /**
     * Pause match
     */
    socket.on(EClientEvent.PAUSE_MATCH, async (matchSessionId, pause, callback) => {
      if (!hasOptionalAck(socket, EClientEvent.PAUSE_MATCH, callback)) return
      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)
        const paused = await server.pauseMatch({ matchSessionId, userSession, pause })
        server
          .emitMatchUpdate(server.tables.getOrThrow(matchSessionId))
          .catch((e) =>
            log.error(safeErrorDetails(e), "Failed to emit match update after pause event")
          )
        callback?.({ success: true, paused })
      } catch (e) {
        callback?.({ error: isSocketError(e), success: false })
      }
    })

    /**
     * Play another match
     */
    socket.on(EClientEvent.PLAY_AGAIN, async (matchSessionId, callback) => {
      if (!hasOptionalAck(socket, EClientEvent.PLAY_AGAIN, callback)) return
      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)
        const newMatchSessionId = await server.playAgain({ matchSessionId, userSession, socket })
        callback?.({ success: !!newMatchSessionId, newMatchSessionId })
      } catch (e) {
        callback?.({ error: isSocketError(e), success: false })
      }
    })

    /**
     * Fetch match details
     */
    socket.on(EClientEvent.FETCH_MATCH_DETAILS, async (matchId, callback) => {
      if (!hasRequiredAck(socket, EClientEvent.FETCH_MATCH_DETAILS, callback)) return
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
      if (!hasRequiredAck(socket, EClientEvent.FETCH_ACCOUNT_DETAILS, callback)) return
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
