import { ExtendedError } from "socket.io/dist/namespace"
import { SocketError, isSocketError } from "../classes/SocketError"
import type { ITrucoshi, TrucoshiSocket } from "../classes/Trucoshi"
import logger from "../../utils/logger"
import { getWordsId } from "../../utils/string/getRandomWord"
import { EClientEvent, EServerEvent } from "../../events"
import { PLAYER_LOBBY_TIMEOUT } from "../../constants"
import { PLAYER_ABANDON_TIMEOUT } from "../../lib"
import { getOpponentTeam } from "../../lib/utils"

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
      if (socket.data.user.account?.id) {
        socket.join(`account:${socket.data.user.account.id}`)
      }
      server.emitSocketSession(socket)
    }
  })

  return (socket: TrucoshiSocket, next: (err?: ExtendedError) => void) => {
    socket.on(EClientEvent.PING, (clientTime) => {
      socket.emit(EServerEvent.PONG, Date.now(), clientTime)
    })

    socket.on("disconnect", async (reason) => {
      logger.info(
        `Socket ${socket.id} disconnected${
          socket.data.user?.account?.id ? ", account: " + socket.data.user.account.id : ""
        }, reason?: %s`,
        reason
      )
      if (socket.data.user) {
        const userRoom = socket.data.user.account?.id
          ? `account:${socket.data.user.account.id}`
          : socket.data.user.session
        const matchingSockets = await server.io.in(userRoom).fetchSockets()
        const isDisconnected = "length" in matchingSockets && matchingSockets.length === 0

        if (isDisconnected) {
          const user = socket.data.user
          const tables = server.tables.findAll((table) => !!table.isSessionPlaying(user.session))

          tables.forEach((table) => server.leaveMatch(table.matchSessionId, socket))

          const userSession = server.sessions.get(socket.data.user.session)
          if (userSession) {
            server
              .leaveQueue(userSession)
              .catch((e) => logger.error({ message: e.message }, "Failed to leave match queue"))
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
     * Join matchmaking queue
     */
    socket.on(EClientEvent.JOIN_QUEUE, async (options, callback) => {
      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)
        const status = await server.joinQueue({ socket, userSession, options })
        callback({ success: true, status })
      } catch (e) {
        log.error(e, "Client event JOIN_QUEUE error")
        callback({ success: false, error: isSocketError(e) })
      }
    })

    socket.on(EClientEvent.FETCH_QUEUE_STATUS, (callback) => {
      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)
        callback({ success: true, status: server.fetchQueueStatus({ socket, userSession }) })
      } catch (e) {
        log.error(e, "Client event FETCH_QUEUE_STATUS error")
        callback({ success: false, error: isSocketError(e) })
      }
    })

    /**
     * Leave matchmaking queue
     */
    socket.on(EClientEvent.LEAVE_QUEUE, async (callback) => {
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
     * Confirm queue proposal
     */
    socket.on(EClientEvent.CONFIRM_QUEUE_MATCH, async (proposalId, callback) => {
      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)
        const update = await server.confirmQueueMatch(proposalId, userSession)
        callback?.({ success: true, update })
      } catch (e) {
        log.error(e, "Client event CONFIRM_QUEUE_MATCH error")
        callback?.({ success: false, error: isSocketError(e) })
      }
    })

    /**
     * Decline queue proposal
     */
    socket.on(EClientEvent.DECLINE_QUEUE_MATCH, async (proposalId, callback) => {
      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)
        await server.declineQueueMatch(proposalId, userSession)
        callback?.({ success: true })
      } catch (e) {
        log.error(e, "Client event DECLINE_QUEUE_MATCH error")
        callback?.({ success: false, error: isSocketError(e) })
      }
    })

    /**
     * Fetch card skin inventory
     */
    socket.on(EClientEvent.FETCH_INVENTORY, async (callback) => {
      try {
        const accountId = socket.data.user?.account?.id

        if (!accountId) {
          throw new SocketError("GAME_REQUIRES_ACCOUNT", "Necesitas iniciar sesion")
        }

        if (!server.inventory) {
          throw new SocketError("NOT_FOUND", "Este server no soporta inventario")
        }

        const inventory = await server.inventory.getInventory(accountId)
        const equippedDeck = await server.inventory.getEffectiveDeck(accountId)

        callback({ success: true, inventory, equippedDeck })
      } catch (e) {
        log.error(e, "Client event FETCH_INVENTORY error")
        callback({ success: false, inventory: [], equippedDeck: {}, error: isSocketError(e) })
      }
    })

    /**
     * Equip or clear one card skin
     */
    socket.on(EClientEvent.SET_DECK_CARD_SKIN, async (card, cardSkinId, callback) => {
      try {
        const accountId = socket.data.user?.account?.id

        if (!accountId) {
          throw new SocketError("GAME_REQUIRES_ACCOUNT", "Necesitas iniciar sesion")
        }

        if (!server.inventory) {
          throw new SocketError("NOT_FOUND", "Este server no soporta inventario")
        }

        await server.inventory.setDeckCardSkin(accountId, card, cardSkinId)

        const inventory = await server.inventory.getInventory(accountId)
        const equippedDeck = await server.inventory.getEffectiveDeck(accountId)

        callback({ success: true, inventory, equippedDeck })
      } catch (e) {
        log.error(e, "Client event SET_DECK_CARD_SKIN error")
        callback({ success: false, inventory: [], equippedDeck: {}, error: isSocketError(e) })
      }
    })

    /**
     * Fetch treasure chest progress
     */
    socket.on(EClientEvent.FETCH_TREASURE_STATUS, async (callback) => {
      try {
        const accountId = socket.data.user?.account?.id

        if (!accountId) {
          throw new SocketError("GAME_REQUIRES_ACCOUNT", "Necesitas iniciar sesion")
        }

        if (!server.treasure) {
          throw new SocketError("NOT_FOUND", "Este server no soporta tesoros")
        }

        const treasureStatus = await server.treasure.getTreasureStatus(accountId)

        callback({ success: true, treasureStatus })
      } catch (e) {
        log.error(e, "Client event FETCH_TREASURE_STATUS error")
        callback({
          success: false,
          treasureStatus: { progress: 0, threshold: 3, unopenedChests: [] },
          error: isSocketError(e),
        })
      }
    })

    /**
     * Open one treasure chest
     */
    socket.on(EClientEvent.OPEN_TREASURE_CHEST, async (chestId, callback) => {
      try {
        const accountId = socket.data.user?.account?.id

        if (!accountId) {
          throw new SocketError("GAME_REQUIRES_ACCOUNT", "Necesitas iniciar sesion")
        }

        if (!server.treasure || !server.inventory) {
          throw new SocketError("NOT_FOUND", "Este server no soporta tesoros")
        }

        const treasureResult = await server.treasure.openChest(accountId, chestId)
        const [treasureStatus, inventory, equippedDeck] = await Promise.all([
          server.treasure.getTreasureStatus(accountId),
          server.inventory.getInventory(accountId),
          server.inventory.getEffectiveDeck(accountId),
        ])

        callback({ success: true, treasureStatus, treasureResult, inventory, equippedDeck })
      } catch (e) {
        log.error(e, "Client event OPEN_TREASURE_CHEST error")
        callback({
          success: false,
          treasureStatus: { progress: 0, threshold: 3, unopenedChests: [] },
          treasureResult: {
            chestId,
            rarity: null,
            cardSkin: null,
            duplicate: false,
            granted: false,
          },
          inventory: [],
          equippedDeck: {},
          error: isSocketError(e),
        })
      }
    })

    /**
     * Grant one unopened treasure chest to the current account in local/dev servers.
     */
    socket.on(EClientEvent.DEV_GRANT_TREASURE_CHEST, async (callback) => {
      try {
        const accountId = socket.data.user?.account?.id

        if (process.env.NODE_ENV === "production") {
          throw new SocketError("FORBIDDEN", "No disponible en produccion")
        }

        if (!accountId) {
          throw new SocketError("GAME_REQUIRES_ACCOUNT", "Necesitas iniciar sesion")
        }

        if (!server.treasure) {
          throw new SocketError("NOT_FOUND", "Este server no soporta tesoros")
        }

        const treasureStatus = await server.treasure.grantDevChest(accountId)

        callback({ success: true, treasureStatus })
      } catch (e) {
        log.error(e, "Client event DEV_GRANT_TREASURE_CHEST error")
        callback({
          success: false,
          treasureStatus: { progress: 0, threshold: 3, unopenedChests: [] },
          error: isSocketError(e),
        })
      }
    })

    /**
     * Fetch active public notice banner.
     */
    socket.on(EClientEvent.FETCH_NOTICE_BANNER, async (callback) => {
      try {
        const noticeBanner = server.admin ? await server.admin.getNoticeBanner() : null

        callback({ success: true, noticeBanner })
      } catch (e) {
        log.error(e, "Client event FETCH_NOTICE_BANNER error")
        callback({
          success: false,
          noticeBanner: null,
          error: isSocketError(e),
        })
      }
    })

    /**
     * Fetch admin operations dashboard.
     */
    socket.on(EClientEvent.ADMIN_FETCH_DASHBOARD, async (callback) => {
      try {
        if (!server.admin) {
          throw new SocketError("NOT_FOUND", "Este server no soporta administracion")
        }

        const dashboard = await server.admin.getDashboard(socket.data.user?.account)

        callback({ success: true, dashboard })
      } catch (e) {
        log.error(e, "Client event ADMIN_FETCH_DASHBOARD error")
        callback({
          success: false,
          dashboard: { onlineAccounts: [], liveGames: [], rewardCodes: [], noticeBanner: null },
          error: isSocketError(e),
        })
      }
    })

    /**
     * Create one single-use chest reward code.
     */
    socket.on(EClientEvent.ADMIN_CREATE_CHEST_REWARD_CODE, async (input, callback) => {
      try {
        if (!server.admin) {
          throw new SocketError("NOT_FOUND", "Este server no soporta administracion")
        }

        const result = await server.admin.createChestRewardCode(socket.data.user?.account, input)

        callback({ success: true, ...result })
      } catch (e) {
        log.error(e, "Client event ADMIN_CREATE_CHEST_REWARD_CODE error")
        callback({
          success: false,
          code: "",
          link: "",
          rewardCode: {
            id: 0,
            codePreview: "",
            createdByAccountId: 0,
            intendedAccountId: null,
            note: null,
            createdAt: "",
            redeemedAt: null,
            redeemedByAccountId: null,
            treasureChestId: null,
          },
          error: isSocketError(e),
        })
      }
    })

    /**
     * Set or hide the global notice banner.
     */
    socket.on(EClientEvent.ADMIN_SET_NOTICE_BANNER, async (input, callback) => {
      try {
        if (!server.admin) {
          throw new SocketError("NOT_FOUND", "Este server no soporta administracion")
        }

        const result = await server.admin.setNoticeBanner(socket.data.user?.account, input)

        callback({ success: true, ...result })
        server.io.emit(EServerEvent.UPDATE_NOTICE_BANNER, result.publicNoticeBanner)
      } catch (e) {
        log.error(e, "Client event ADMIN_SET_NOTICE_BANNER error")
        callback({
          success: false,
          noticeBanner: null,
          publicNoticeBanner: null,
          error: isSocketError(e),
        })
      }
    })

    /**
     * Redeem one single-use reward code for the logged-in account.
     */
    socket.on(EClientEvent.REDEEM_REWARD_CODE, async (code, callback) => {
      try {
        const accountId = socket.data.user?.account?.id

        if (!accountId) {
          throw new SocketError("GAME_REQUIRES_ACCOUNT", "Necesitas iniciar sesion")
        }

        if (!server.admin) {
          throw new SocketError("NOT_FOUND", "Este server no soporta recompensas")
        }

        const result = await server.admin.redeemRewardCode(accountId, code)

        callback({ success: true, ...result })
      } catch (e) {
        log.error(e, "Client event REDEEM_REWARD_CODE error")
        callback({
          success: false,
          grantedChest: { id: 0, sourceMatchId: null, earnedAt: "" },
          treasureStatus: { progress: 0, threshold: 3, unopenedChests: [] },
          error: isSocketError(e),
        })
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
     * Create Tutorial Match
     */
    socket.on(EClientEvent.CREATE_TUTORIAL_MATCH, async (tutorialId, callback) => {
      try {
        if (!socket.data.user) {
          throw new Error("Attempted to create a tutorial match without a session")
        }
        const userSession = server.sessions.getOrThrow(socket.data.user.session)

        if (!userSession) {
          throw new Error("Attempted to create a tutorial match without a user")
        }

        log.trace(userSession.getPublicInfo(), "User creating tutorial match...")

        const table = await server.createTutorialMatch({ userSession, socket, tutorialId })

        return callback({
          success: true,
          match: table.getPublicMatch(userSession.session),
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
          socket,
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
        callback?.({
          success: true,
          activeMatches: server.getSessionActiveMatches(socket.data.session),
        })
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
     * Pause match
     */
    socket.on(EClientEvent.PAUSE_MATCH, async (matchSessionId, pause, callback) => {
      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)
        const paused = await server.pauseMatch({ matchSessionId, userSession, pause })
        server
          .emitMatchUpdate(server.tables.getOrThrow(matchSessionId))
          .catch((e) =>
            log.error({ message: e.message }, "Failed to emit match update after pause event")
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
