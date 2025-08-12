import { randomUUID } from "crypto"
import debounce from "lodash.debounce"
import { createServer, Server as HttpServer } from "http"
import { RemoteSocket, Server, Socket } from "socket.io"
import {
  EAnswerCommand,
  ECommand,
  EHandState,
  EMatchState,
  ESayCommand,
  GAME_ERROR,
  IAccountDetails,
  ICard,
  ILobbyOptions,
  IMatchDetails,
  IPlayer,
  IPlayerRanking,
  IPublicMatch,
  IPublicMatchInfo,
  IPublicMatchStats,
  IPublicPlayer,
  ITeam,
  ITrucoshiStats,
  IUserData,
  IWaitingPlayData,
} from "../../types"
import { Chat, IChat } from "./Chat"
import { IMatchTable, MatchTable } from "./MatchTable"
import { IUserSession, ISocketMatchState, UserSession } from "./UserSession"
import logger from "../../utils/logger"
import { PayRequest, User } from "lightning-accounts"
import { createAdapter } from "@socket.io/redis-adapter"
import { accountsApi, validateJwt } from "../../accounts/client"
import { createClient } from "redis"
import { MatchPlayer, Prisma, PrismaClient, UserStats } from "@prisma/client"
import { SocketError } from "./SocketError"
import { TMap } from "./TMap"
import { ClientToServerEvents, EServerEvent, ServerToClientEvents } from "../../events"
import { IHand, IPlayInstance } from "../../truco"
import {
  MATCH_FINISHED_CLEANUP_TIMEOUT,
  PLAYER_LOBBY_TIMEOUT,
  PLAYER_TIMEOUT_GRACE,
} from "../../constants"
import { BOT_NAMES } from "../../truco/Bot"
import { getCardSound, getCommandSound } from "../sounds"
import { getOpponentTeam } from "../../lib/utils"
import { PAUSE_REQUEST_TIMEOUT, PLAYER_ABANDON_TIMEOUT, UNPAUSE_TIME } from "../../lib"
import { TrucoshiTurn } from "./Turn"
import { getWordsId } from "../../utils/string/getRandomWord"

const log = logger.child({ class: "Trucoshi" })

interface MatchTableMap extends TMap<string, IMatchTable> {
  getAll(filters: { state?: Array<EMatchState> }): Array<IPublicMatchInfo>
}

class MatchTableMap extends TMap<string, IMatchTable> {
  getAll(filters: { state?: Array<EMatchState> } = {}) {
    let results: Array<IPublicMatchInfo> = []

    for (let value of this.values()) {
      if (!filters.state || !filters.state.length || filters.state.includes(value.state())) {
        results.push(value.getPublicMatchInfo())
      }
    }

    return results.reverse()
  }
}

interface InterServerEvents {}

interface SocketData {
  user?: IUserData
  identity?: string
  matches: TMap<string, ISocketMatchState>
  throttler?: (...any: any[]) => any
}

export type TrucoshiServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>

export type TrucoshiSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>

export interface ITrucoshi {
  io: TrucoshiServer
  httpServer: HttpServer
  ranking: IPlayerRanking[]
  store?: PrismaClient
  chat: IChat
  tables: MatchTableMap // sessionId, table
  sessions: TMap<string, IUserSession> // sessionId, user
  turns: TMap<string, TrucoshiTurn> // sessionId, play instance
  stats: ITrucoshiStats
  emitStats(): void
  createUserSession(socket: TrucoshiSocket, username?: string, token?: string): IUserSession
  getTableSockets(
    table: IMatchTable,
    callback?: (
      playerSocket: RemoteSocket<ServerToClientEvents, SocketData>,
      player: IPlayer | null
    ) => Promise<void>
  ): Promise<{ sockets: any[]; players: IPublicPlayer[]; spectators: any[] }>
  getSessionActiveMatches(session?: string, socket?: TrucoshiSocket): IPublicMatchInfo[]
  login(input: { socket: TrucoshiSocket; account: User; identityJwt: string }): Promise<void>
  logout(socket: TrucoshiSocket): void
  emitSocketSession(socket: TrucoshiSocket): Promise<void>
  leaveMatch(matchId: string, socket: TrucoshiSocket, force?: boolean): Promise<void>
  emitWaitingPossibleSay(input: {
    play: IPlayInstance
    table: IMatchTable
    onlyThisSocket?: string
  }): Promise<void>
  emitWaitingForPlay(input: {
    play: IPlayInstance
    table: IMatchTable
    onlyThisSocket?: string
  }): Promise<"say" | "play">
  emitMatchUpdate(
    table: IMatchTable,
    skipSocketIds?: Array<string>,
    skipPreviousHand?: boolean
  ): Promise<IPublicMatch>
  emitFlorBattle(hand: IHand, table: IMatchTable): Promise<void>
  emitSocketMatch(socket: TrucoshiSocket, currentMatchId: string | null): IPublicMatch | null
  playCard(input: {
    table: IMatchTable | string
    play: IPlayInstance
    player: IPlayer
    cardIdx: number
    card: ICard
  }): Promise<void>
  sayCommand(
    input: {
      table: IMatchTable | string
      play: IPlayInstance
      player: IPlayer
      command: ECommand | number
    },
    force?: boolean
  ): Promise<void>
  createMatchTable(
    userSession: IUserSession,
    socket: TrucoshiSocket | RemoteSocket<ServerToClientEvents, SocketData>
  ): Promise<IMatchTable>
  setMatchOptions(input: {
    socket: TrucoshiSocket | RemoteSocket<ServerToClientEvents, SocketData>
    matchSessionId: string
    userSession: IUserSession
    options: Partial<ILobbyOptions>
    emitChat?: boolean
  }): Promise<IMatchTable>
  setMatchPlayerReady(input: {
    matchSessionId: string
    userSession: IUserSession
    ready: boolean
  }): Promise<IMatchTable>
  checkUserSufficientBalance(input: {
    identityJwt: string
    account: User
    satsPerPlayer: number
  }): Promise<boolean>
  joinMatch(
    table: IMatchTable,
    userSession: IUserSession,
    socket: TrucoshiSocket | RemoteSocket<ServerToClientEvents, SocketData>,
    teamIdx?: 0 | 1
  ): Promise<IPlayer>
  addBot(table: IMatchTable, userSession: IUserSession, teamIdx?: 0 | 1): Promise<IPlayer>
  cleanupUserTables(userSession: IUserSession): Promise<void>
  startMatch(input: {
    identityJwt: string | null
    matchSessionId: string
    userSession: IUserSession
  }): Promise<void>
  kickPlayer(input: {
    key: string
    matchSessionId: string
    userSession: IUserSession
  }): Promise<void>
  pauseMatch(input: {
    matchSessionId: string
    userSession?: IUserSession
    pause: boolean
  }): Promise<boolean>
  playAgain(input: {
    matchSessionId: string
    userSession: IUserSession
    socket: TrucoshiSocket | RemoteSocket<ServerToClientEvents, SocketData>
  }): Promise<string | undefined>
  setTurnTimeout(params: {
    table: IMatchTable
    user: IUserSession
    play: IPlayInstance
    resolve: () => void
    turn: () => void
    cancel: () => void
  }): void
  clearTurnTimeout(matchSessionId: string): void
  onHandFinished(table: IMatchTable, hand: IHand | null): Promise<void>
  onBotTurn(table: IMatchTable, play: IPlayInstance): Promise<void>
  onTurn(table: IMatchTable, play: IPlayInstance): Promise<void>
  onTruco(table: IMatchTable, play: IPlayInstance): Promise<void>
  onEnvido(table: IMatchTable, play: IPlayInstance, isPointsRounds: boolean): Promise<void>
  onFlor(table: IMatchTable, play: IPlayInstance): Promise<void>
  onFlorBattle(table: IMatchTable, play: IPlayInstance, hand: IHand | null): Promise<void>
  onWinner(table: IMatchTable, winner: ITeam): Promise<void>
  removePlayerAndCleanup(table: IMatchTable, player: IPlayer): Promise<void>
  deletePlayerAndReturnBet(table: IMatchTable, player: MatchPlayer): Promise<void>
  cleanupMatchTable(table: IMatchTable): Promise<void>
  getAccountDetails(socket: TrucoshiSocket, accountId: number): Promise<IAccountDetails>
  getMatchDetails(socket: TrucoshiSocket, matchId: number): Promise<IMatchDetails>
  getRanking(): Promise<Array<IPlayerRanking>>
  resetSocketsMatchState(table: IMatchTable): Promise<void>
  listen: (
    callback: (io: TrucoshiServer) => void,
    options?: { redis?: boolean; lightningAccounts?: boolean; store?: boolean }
  ) => Promise<TrucoshiServer>
}

export const Trucoshi = ({
  port,
  origin,
  serverVersion,
}: {
  port: number
  origin?: string | Array<string>
  serverVersion: string
}) => {
  const httpServer = createServer()

  const pubClient = createClient({ url: process.env.APP_REDIS_URL })
  const subClient = pubClient.duplicate()

  pubClient.on("error", (e) => {
    log.error(e, "Redis Pub Client Error")
  })

  subClient.on("error", (e) => {
    log.error(e, "Redis Sub Client Error")
  })

  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      pingInterval: 10000, // Send ping every 10s
      pingTimeout: 20000, // Disconnect if no pong in 5s
      cors: {
        credentials: true,
        origin,
        methods: ["GET", "POST"],
      },
    }
  )

  const sessions = new TMap<string, IUserSession>() // sessionId (token), user
  const tables = new MatchTableMap() // sessionId, table
  const turns = new TMap<string, TrucoshiTurn>() // sessionId, play instance, play promise resolve and type

  const server: ITrucoshi = {
    sessions,
    store: undefined,
    ranking: [],
    tables,
    turns,
    io,
    chat: Chat(),
    httpServer,
    stats: {
      onlinePlayers: [],
    },
    async listen(
      callback,
      { redis = true, lightningAccounts = true, store = true } = {
        redis: true,
        lightningAccounts: true,
        store: true,
      }
    ) {
      if (lightningAccounts) {
        logger.debug(
          "Logging in to lightning-accounts at " + process.env.APP_LIGHTNING_ACCOUNTS_URL
        )
        try {
          await accountsApi.auth.getUserProfile()
          logger.info("Logged in to lightning-accounts")
        } catch (e) {
          logger.error(e, "Failed to login to lightning-accounts")
        }
      }

      if (redis) {
        logger.debug("Connecting to redis at " + process.env.APP_REDIS_URL)
        try {
          await Promise.all([pubClient.connect(), subClient.connect()])
          io.adapter(
            createAdapter(pubClient, subClient, {
              key: process.env.APP_LIGHTNING_ACCOUNTS_EMAIL || process.env.NODE_ENV || "default",
            })
          )
          logger.info("Connected to Redis")
        } catch (e) {
          logger.error(e, "Failed to connect to Redis")
        }
      }

      if (store) {
        logger.debug("Connecting to Postgres")
        server.store = new PrismaClient()
        try {
          await server.store.$connect()
          logger.info("Connected to Postgres")
        } catch (e) {
          logger.error(e, "Failed to connect to Postgres")
        }

        try {
          const unpaidMatches = await server.store.match.findMany({
            where: {
              bet: { satsPerPlayer: { gt: 0 }, winnerAwarded: false, refunded: false },
            },
            include: { bet: true, players: true },
          })

          if (unpaidMatches.length > 0) {
            logger.warn(
              { unpaidMatchesLength: unpaidMatches.length },
              "Found matches that had outstanding bets, trying to repay players entrance sats..."
            )
          }

          for (const match of unpaidMatches) {
            const matchLog = log.child({ matchSessionId: match.sessionId, matchId: match.id })
            matchLog.info(
              { players: match.players },
              "Trying to repay bets to players on this match..."
            )

            await server.store.$transaction(
              async (tx) => {
                for (const player of match.players) {
                  if (!player.accountId || !player.satsPaid || !player.payRequestId) {
                    matchLog.info(
                      {
                        playerId: player.id,
                        accountId: player.accountId,
                        satsPaid: player.satsPaid,
                        payRequestId: player.payRequestId,
                      },
                      "Skipping refund: Missing accountId, satsPaid, or payRequestId"
                    )
                    await tx.matchPlayer.update({
                      where: { id: player.id },
                      data: { satsPaid: 0, payRequestId: null },
                    })
                    continue
                  }

                  // Skip players who received awards
                  if (player.satsReceived && player.satsReceived > 0) {
                    matchLog.info(
                      {
                        playerId: player.id,
                        accountId: player.accountId,
                        satsReceived: player.satsReceived,
                      },
                      "Skipping refund: Player already received award"
                    )
                    continue
                  }

                  const amountInSats = player.satsPaid
                  matchLog.info(
                    {
                      playerAccountId: player.accountId,
                      satsPaid: player.satsPaid,
                      amountInSats,
                      payRequestId: player.payRequestId,
                      apiUrl: process.env.APP_LIGHTNING_ACCOUNTS_URL,
                    },
                    "Looking for paid pay request"
                  )

                  let pr
                  try {
                    pr = await accountsApi.wallet.getPayRequest(String(player.payRequestId))
                    matchLog.info(
                      {
                        isPaid: pr.data.paid,
                        payRequestId: pr.data.id,
                        amountInSats: pr.data.amountInSats,
                      },
                      "Found Pay Request"
                    )
                  } catch (e: any) {
                    matchLog.warn(
                      {
                        error: e.response?.data || e.message,
                        status: e.response?.status,
                        payRequestId: player.payRequestId,
                        apiUrl: process.env.APP_LIGHTNING_ACCOUNTS_URL,
                      },
                      "Failed to get pay request, skipping player"
                    )
                    await tx.matchPlayer.update({
                      where: { id: player.id },
                      data: { satsPaid: 0, payRequestId: null },
                    })
                    continue
                  }

                  if (pr.data.paid) {
                    const existingRefund = await tx.matchPlayer.findFirst({
                      where: {
                        id: player.id,
                        satsPaid: 0,
                        payRequestId: null,
                      },
                    })
                    if (existingRefund) {
                      matchLog.warn(
                        { playerAccountId: player.accountId },
                        "Player already refunded, skipping"
                      )
                      continue
                    }

                    matchLog.info(
                      {
                        isPaid: pr.data.paid,
                        payRequestId: pr.data.id,
                        amountInSats,
                      },
                      "Pay request is paid, refunding user"
                    )

                    try {
                      const walletBefore = await accountsApi.users.getUserWallet(
                        String(player.accountId)
                      )
                      matchLog.debug(
                        {
                          playerAccountId: player.accountId,
                          balanceBefore: walletBefore.data.balanceInSats,
                        },
                        "Wallet balance before refund"
                      )

                      await tx.matchPlayer.update({
                        where: { id: player.id },
                        data: { satsPaid: 0, payRequestId: null },
                      })

                      await accountsApi.wallet.payUser({
                        amountInSats: pr.data.amountInSats,
                        userId: player.accountId,
                        description: `Returning bet from unfinished match ID: ${match.id}`,
                      })

                      const walletAfter = await accountsApi.users.getUserWallet(
                        String(player.accountId)
                      )
                      matchLog.debug(
                        {
                          playerAccountId: player.accountId,
                          balanceAfter: walletAfter.data.balanceInSats,
                          amountRefunded: pr.data.amountInSats,
                        },
                        "Wallet balance after refund"
                      )

                      matchLog.info(
                        {
                          playerAccountId: player.accountId,
                          amountInSats: pr.data.amountInSats,
                        },
                        "Returned bet to player"
                      )
                    } catch (e: any) {
                      matchLog.error(
                        {
                          error: e.response?.data || e.message,
                          playerAccountId: player.accountId,
                          amountInSats,
                        },
                        "Failed to refund user, skipping"
                      )
                      throw e
                    }
                  }
                }

                const hasAwards = match.players.some((p) => p.satsReceived && p.satsReceived > 0)
                if (!hasAwards) {
                  await tx.matchBet.update({
                    where: { id: match.bet?.id },
                    data: { refunded: true },
                  })
                  matchLog.info({ matchId: match.id }, "Marked matchBet as refunded")
                } else {
                  matchLog.warn(
                    {
                      matchId: match.id,
                      playersWithAwards: match.players.filter((p) => p.satsReceived > 0),
                    },
                    "Skipping refund: Some players received awards"
                  )
                }
              },
              { timeout: 60000 }
            )
          }
        } catch (e) {
          logger.error(e, "Failed to repay unpaid matches!")
        }
      }

      if (lightningAccounts && store) {
        await server.getRanking()
      }

      io.listen(port)
      server.chat = Chat(io, tables)
      callback(io)
      return io
    },
    getSessionActiveMatches(session, socket) {
      if (!session) {
        return []
      }
      return server.tables
        .findAll((table) => {
          if (table.state() === EMatchState.FINISHED) {
            return false
          }
          return Boolean(table.isSessionPlaying(session))
        })
        .map((match) => {
          const info = match.getPublicMatchInfo()
          if (socket) {
            if (!socket.data.matches) {
              socket.data.matches = new TMap()
            }
            socket.data.matches.set(match.matchSessionId, {
              isWaitingForPlay: false,
              isWaitingForSay: false,
            })
          }
          return info
        })
    },
    emitStats: debounce(() => {
      server.stats = {
        onlinePlayers: server.sessions
          .findAll((s) => s.online)
          .map<number>((s) => s.account?.id || -1),
      }
      server.io.to("stats").emit(EServerEvent.UPDATE_STATS, server.stats)
    }, 1800),
    createUserSession(socket, id, token) {
      const session = token || randomUUID()
      const key = randomUUID()
      const userSession = UserSession(key, id || "Satoshi", session)
      socket.data.user = userSession.getUserData()
      socket.data.matches = new TMap()
      server.sessions.set(session, userSession)

      userSession.on("connect", () => {
        server.emitStats()
      })

      userSession.on("disconnect", () => {
        server.emitStats()
      })

      userSession.connect()

      return userSession
    },
    async login({ socket, account, identityJwt }) {
      const payload = validateJwt(identityJwt, account)

      const res = await accountsApi.users.getUser(String(payload.sub))

      if (socket.data.user) {
        server.logout(socket)
      }

      const userSession =
        server.sessions.find((s) => s.account?.id === payload.sub) ||
        server.createUserSession(socket)

      userSession.setAccount(res.data)
      userSession.setName(res.data.name)
      userSession.reconnect(userSession.session)
      socket.data.user = userSession.getUserData()
      socket.data.identity = identityJwt

      if (!socket.data.matches) {
        socket.data.matches = new TMap()
      }

      log.debug(
        { ...userSession.getPublicInfo(), socket: socket.id },
        "Socket has logged into account"
      )
    },
    logout(socket) {
      if (!socket.data.user) {
        throw new Error("Socket doesn't have user data")
      }

      const userSession = server.sessions.getOrThrow(socket.data.user.session)
      socket.leave(userSession.session)

      for (const key in socket.data.matches?.keys()) {
        socket.leave(key)
        socket.leave(key + 0)
        socket.leave(key + 1)
      }

      socket.disconnect()

      log.debug(socket.data.user, "Socket has logged out off account")
    },
    async emitSocketSession(socket) {
      if (!socket.data.user) {
        return
      }
      const activeMatches = server.getSessionActiveMatches(socket.data.user.session)
      socket.emit(EServerEvent.SET_SESSION, socket.data.user, serverVersion, activeMatches)

      const userSession = server.sessions.getOrThrow(socket.data.user.session)

      for (const matchSessionId of [
        ...Array.from(socket.data.matches?.keys() || []),
        ...server.getSessionActiveMatches(userSession.session).map((m) => m.matchSessionId),
      ]) {
        const table = server.tables.get(matchSessionId)
        if (table) {
          const player = table.isSessionPlaying(userSession.session)
          if (player) {
            const reconnectType = table.state() === EMatchState.STARTED ? "turn" : "disconnection"
            userSession.reconnect(matchSessionId, reconnectType)
            socket.join(matchSessionId)
            socket.join(matchSessionId + player.teamIdx)

            if (table.playing()) {
              server.emitSocketMatch(socket, matchSessionId)
            } else {
              player.rename(socket.data.user.name)
              socket.emit(
                EServerEvent.UPDATE_MATCH,
                table.getPublicMatch(player ? (userSession.session as string) : undefined)
              )
            }
          }
        }
      }
    },
    async getTableSockets(table, callback) {
      const allSockets = await server.io.of("/").in(table.matchSessionId).fetchSockets()

      table.log.trace({ sockets: allSockets.map((s) => s.id) }, "Got all Match Table sockets...")

      const players: IPublicPlayer[] = []
      const playerSockets: RemoteSocket<ServerToClientEvents, SocketData>[] = []
      const spectatorSockets: RemoteSocket<ServerToClientEvents, SocketData>[] = []

      if (!allSockets || !("length" in allSockets) || !allSockets.length) {
        table.log.debug(
          table.getPublicMatchInfo(),
          "Nobody is here? No sockets for this match table..."
        )
        return { players: [], sockets: [], spectators: [] }
      }

      for (const playerSocket of allSockets) {
        if (!playerSocket.data.user?.session) {
          spectatorSockets.push(playerSocket)
          // don't await for spectators
          callback?.(playerSocket, null)
          continue
        }

        const player = table.isSessionPlaying(playerSocket.data.user.session)

        if (player) {
          players.push(player.getPublicPlayer(playerSocket.data.user.session))
          playerSockets.push(playerSocket)
        } else {
          spectatorSockets.push(playerSocket)
        }

        if (callback) {
          await callback(playerSocket, player)
        }
      }

      return { sockets: playerSockets, spectators: spectatorSockets, players }
    },
    async emitMatchUpdate(table, skipSocketIds = [], skipPreviousHand = false) {
      table.log.debug(table.getPublicMatchInfo(), "Preparing to emit match update to all sockets")
      const { spectators, sockets } = await server.getTableSockets(table)
      const stats: IPublicMatchStats = { spectators: spectators.length || 0 }
      const publicMatch = table.getPublicMatch(undefined, undefined, skipPreviousHand)
      table.log.info(
        {
          matchSessionId: table.matchSessionId,
          state: publicMatch.state,
          players: publicMatch.players.map((p) => ({
            name: p.name,
            isTurn: p.isTurn,
            turnExpiresAt: p.turnExpiresAt,
            turnExtensionExpiresAt: p.turnExtensionExpiresAt,
            disabled: p.disabled,
            abandoned: p.abandoned,
          })),
        },
        "Public match data for UPDATE_MATCH"
      )
      const filterFn = (socket: TrucoshiSocket) =>
        !skipSocketIds.includes(socket.id) && socket.data.user
      sockets.filter(filterFn).forEach((socket) => {
        const playerMatch = socket.data.user
          ? table.getPublicMatch(socket.data.user.session, false, skipPreviousHand)
          : publicMatch
        table.log.debug(
          { socketId: socket.id, userSession: socket.data.user?.session },
          "Emitting UPDATE_MATCH to player socket"
        )
        socket.emit(EServerEvent.UPDATE_MATCH, playerMatch, stats)
      })
      spectators.filter(filterFn).forEach((socket) => {
        table.log.debug({ socketId: socket.id }, "Emitting UPDATE_MATCH to spectator socket")
        socket.emit(EServerEvent.UPDATE_MATCH, publicMatch, stats)
      })
      return publicMatch
    },
    async emitWaitingPossibleSay({ play, table, onlyThisSocket }) {
      table.log.trace({ handIdx: play.handIdx }, "Emitting match possible players say")
      return new Promise<void>((resolve) => {
        return server
          .getTableSockets(table, async (playerSocket, player) => {
            if (onlyThisSocket && playerSocket.id !== onlyThisSocket) {
              return
            }
            if (!player) {
              playerSocket.emit(EServerEvent.UPDATE_MATCH, table.getPublicMatch())
              return
            }

            if (!playerSocket.data.matches) {
              log.error(Error("Player socket doesn't have data.matches!!!"))
              return
            }

            if (playerSocket.data.matches.get(table.matchSessionId)?.isWaitingForSay) {
              return
            }

            table.log.trace(
              { player: player.getPublicPlayer("log") },
              "Emitting waiting possible say to a player"
            )

            if (player.disabled) {
              playerSocket.emit(
                EServerEvent.UPDATE_MATCH,
                table.getPublicMatch(
                  player ? (playerSocket.data.user?.session as string) : undefined
                )
              )
              return
            }

            if (player.bot) {
              return
            }

            playerSocket.emit(
              EServerEvent.WAITING_POSSIBLE_SAY,
              table.getPublicMatch(player.session, play.freshHand || false),
              (data) => {
                if (!data || !play.waitingPlay) {
                  table.log.warn(
                    { player: player.getPublicPlayer() },
                    "Tried to say something but someone said something already or callback data came empty"
                  )
                  return
                }
                const { command } = data
                server
                  .sayCommand({ table, play, player, command })
                  .then(() => {
                    resolve()
                    server.sessions.getOrThrow(player.session).reconnect(table.matchSessionId)
                  })
                  .catch((e) =>
                    table.log.warn(
                      { message: e.message, command, playerIdx: player.idx },
                      "Failed to say commmand"
                    )
                  )
              }
            )
          })
          .catch((e) => table.log.error({ message: e.message }, "emitWaitingPossibleSay error"))
      })
    },
    async emitWaitingForPlay({ play, table, onlyThisSocket }) {
      return new Promise<"say" | "play">((resolve) => {
        server
          .emitWaitingPossibleSay({ play, table, onlyThisSocket })
          .then(() => resolve("say"))
          .catch((e) =>
            table.log.error(e, "Error on emitWaitingForPlay, rejected waitingPossibleSay")
          )
        return server
          .getTableSockets(table, async (playerSocket, player) => {
            if (onlyThisSocket && playerSocket.id !== onlyThisSocket) {
              return
            }

            if (!player) {
              return
            }

            if (!playerSocket.data.matches) {
              table.log.error({ player: player.name }, "Player socket doesn't have data.matches!")
              return
            }

            if (playerSocket.data.matches.get(table.matchSessionId)?.isWaitingForPlay) {
              return
            }

            if (player.session === play.player?.session) {
              table.log.trace(
                {
                  handIdx: play.handIdx,
                  rounds: play.getHand().roundsLogFlatten,
                  player: player.getPublicPlayer("log"),
                },
                "Emitting waiting play to a player"
              )
              playerSocket.emit(
                EServerEvent.WAITING_PLAY,
                table.getPublicMatch(player.session),
                (data: IWaitingPlayData) => {
                  if (!data || !play.waitingPlay) {
                    table.log.warn(
                      { player: player.getPublicPlayer() },
                      "Tried to play a card but play is not waiting a play or callback returned empty"
                    )
                    return
                  }
                  const { cardIdx, card } = data
                  server
                    .playCard({ table, play, player, cardIdx, card })
                    .then(() => {
                      resolve("play")
                      server.sessions.getOrThrow(player.session).reconnect(table.matchSessionId)
                    })
                    .catch((e) =>
                      table.log.warn(
                        { message: e.message, card, playerIdx: player.idx },
                        "Failed to play card"
                      )
                    )
                }
              )
            }
          })
          .catch((e) => table.log.error({ message: e.message }, "emitWaitingForPlay error"))
      })
    },
    sayCommand({ table, play, player, command }, force) {
      const matchTable = typeof table === "string" ? server.tables.getOrThrow(table) : table
      return new Promise<void>((resolve, reject) => {
        if (command || command === 0) {
          matchTable.log.trace(
            { player: player.getPublicPlayer("log"), command },
            "Attempt to say command"
          )

          const hand = play.getHand()
          const currentState = hand.state

          const saidCommand = play.say(command, player, force)

          if (saidCommand || saidCommand === 0) {
            matchTable.log.trace(
              { player: player.getPublicPlayer(), command },
              "Say command success"
            )

            server.clearTurnTimeout(matchTable.matchSessionId)

            server.chat.rooms
              .getOrThrow(matchTable.matchSessionId)
              .command(
                player.teamIdx as 0 | 1,
                saidCommand,
                getCommandSound({ command: saidCommand, state: currentState, player })
              )

            if (
              currentState === EHandState.WAITING_ENVIDO_POINTS_ANSWER &&
              hand.envido.finished &&
              hand.envido.winner
            ) {
              server.chat.rooms
                .getOrThrow(matchTable.matchSessionId)
                .system(`El envido se lo lleva ${hand.envido.winner.name}`, true)
            }

            return server.resetSocketsMatchState(matchTable).then(resolve).catch(reject)
          }

          if (force) {
            return resolve()
          }

          return reject(new Error("Invalid Command " + command))
        }
        return reject(new Error("Undefined Command"))
      })
    },
    playCard({ table, play, player, cardIdx, card }) {
      const matchTable = typeof table === "string" ? server.tables.getOrThrow(table) : table
      return new Promise<void>((resolve, reject) => {
        if (cardIdx !== undefined && card) {
          matchTable.log.trace(
            { card, cardIdx, player: player.getPublicPlayer("log") },
            "Attempt to play card"
          )
          const playedCard = play.use(cardIdx, card)
          if (playedCard) {
            matchTable.log.trace(
              { player: player.getPublicPlayer("log"), card, cardIdx },
              "Play card success"
            )
            server.clearTurnTimeout(matchTable.matchSessionId)

            const sound = getCardSound({ play, card })

            server.chat.rooms.getOrThrow(matchTable.matchSessionId).card(player, playedCard, sound)
            return server.resetSocketsMatchState(matchTable).then(resolve).catch(reject)
          }
          return reject(new Error("Invalid Card " + card))
        }
        return reject(new Error("Undefined Card"))
      })
    },
    async resetSocketsMatchState(table) {
      await server.getTableSockets(table, async (playerSocket, player) => {
        if (!playerSocket.data.matches) {
          return table.log.error(
            { player: player?.name },
            "Player socket doesn't have data.matches!!!"
          )
        }
        playerSocket.data.matches.set(table.matchSessionId, {
          isWaitingForPlay: false,
          isWaitingForSay: false,
        })
      })
    },
    async emitFlorBattle(hand, table) {
      table.log.trace(table.getPublicMatchInfo(), "Emitting flor battle to players")

      server.clearTurnTimeout(table.matchSessionId)

      const match = await server.emitMatchUpdate(table)

      const chat = server.chat.rooms.getOrThrow(table.matchSessionId)

      if (hand.flor.accepted) {
        match.florBattle?.playersWithFlor
          .sort((a, b) => a.points - b.points)
          .forEach((player) => {
            chat.command(player.team, player.points)
          })
      }

      const promises: Array<PromiseLike<void>> = []
      await server.getTableSockets(table, async (_playerSocket, player) => {
        promises.push(
          new Promise<void>((resolvePlayer, rejectPlayer) => {
            if (!player || !hand) {
              return rejectPlayer()
            }

            const florPlayer = hand.flor.candidates.find((c) => c.idx === player.idx)

            if (process.env.APP_DISABLE_TIMERS !== "1" && florPlayer?.flor && hand.flor.accepted) {
              return setTimeout(resolvePlayer, table.lobby.ackTime * 0.75)
            }

            return resolvePlayer()
          }).catch(() => table.log.error(player, "Resolved flor battle emit"))
        )
      })

      if (hand.flor.winner) {
        chat.system(`La flor se la lleva ${hand.flor.winner.name}`)
      }

      table.log.trace(table.getPublicMatchInfo(), "Awaiting all flor battle promises")

      await Promise.allSettled(promises)

      table.log.trace(
        table.getPublicMatchInfo(),
        "Flor battle timeout has finished, all players settled for next hand"
      )
    },
    async onBotTurn(table, play) {
      return new Promise(async (resolve, reject) => {
        server
          .emitWaitingPossibleSay({ play, table })
          .then(() => resolve())
          .catch((e) => table.log.error(e, "Error onBotTurn, rejected waitingPossibleSay"))

        const player = play.player
        if (!player || !player.bot || !table.lobby.table) {
          return reject()
        }

        const turn = () =>
          player
            .playBot(table.lobby.table!, play, server.playCard, server.sayCommand)
            .then(resolve)
            .catch(reject)

        turn()

        server.turns.set(
          table.matchSessionId,
          new TrucoshiTurn({
            play,
            resolve,
            retry: turn,
            cancel: reject,
            createdAt: Date.now(),
            timeout: null,
          })
        )
      })
    },
    clearTurnTimeout(matchSessionId) {
      const turn = server.turns.getOrThrow(matchSessionId)
      if (turn.timeout) {
        clearTimeout(turn.timeout)
      }
    },
    setTurnTimeout({ table, play, user, resolve, turn, cancel }) {
      const currentHand = play.getHand()
      const player = play.player
      if (!player) {
        table.log.error(
          { matchSessionId: table.matchSessionId },
          "Setting turn on turn play with no current player set"
        )
        return
      }
      table.log.trace(
        {
          matchSessionId: table.matchSessionId,
          player: player.getPublicPlayer("log"),
          handIdx: play.handIdx,
          roundIdx: play.roundIdx,
          state: play.state,
          options: table.lobby.options,
        },
        "Starting new player turn timeout"
      )
      const chat = server.chat.rooms.getOrThrow(table.matchSessionId)
      player.setTurnExpiration(table.lobby.options.turnTime, table.lobby.options.abandonTime)
      turn()
      function createTimeout(pausedTime: number) {
        if (!play.player?.turnExpiresAt || !play.player.turnExtensionExpiresAt) {
          table.log.error(
            {
              matchSessionId: table.matchSessionId,
              player: play.player?.getPublicPlayer("log"),
              turnExpiresAt: play.player?.turnExpiresAt,
              turnExtensionExpiresAt: play.player?.turnExtensionExpiresAt,
            },
            "Missing turn expiration on createTimeout"
          )
          return null
        }
        const now = Date.now()
        const isInExtensionPeriod = now >= play.player.turnExpiresAt
        const timeoutDuration =
          isInExtensionPeriod && player
            ? Math.max(play.player.turnExtensionExpiresAt - now - player.abandonedTime, 0)
            : Math.max(play.player.turnExpiresAt - now + PLAYER_TIMEOUT_GRACE, 0)

        table.log.trace(
          {
            matchSessionId: table.matchSessionId,
            player: play.player.getPublicPlayer("log"),
            timeoutDuration,
            turnExpiresAt: play.player.turnExpiresAt,
            turnExtensionExpiresAt: play.player.turnExtensionExpiresAt,
            isInExtensionPeriod,
            now,
            pausedTime,
          },
          `Scheduling turn timeout (turnExtensionExpiresAt - now = ${
            play.player.turnExtensionExpiresAt - now
          }ms)`
        )

        return setTimeout(() => {
          const timedOutAt = play.player?.disconnectedAt || Date.now()
          const tPlayer = play.player
          if (!tPlayer || !tPlayer.turnExtensionExpiresAt) {
            table.log.error(
              { matchSessionId: table.matchSessionId, player: tPlayer?.getPublicPlayer("log") },
              "Turn timeout fired but player or turnExtensionExpiresAt is missing"
            )
            return
          }
          table.playerDisconnected(tPlayer)
          tPlayer.disconnectedAt = timedOutAt

          const reconnectDuration = Math.max(
            tPlayer.turnExtensionExpiresAt - timedOutAt - tPlayer.abandonedTime,
            PLAYER_TIMEOUT_GRACE * 5
          )

          table.log.trace(
            {
              matchSessionId: table.matchSessionId,
              player: tPlayer.getPublicPlayer("log"),
              reconnectDuration,
              abandonTime: table.lobby.options.abandonTime,
              abandonedTime: tPlayer.abandonedTime,
              timedOutAt,
              turnExtensionExpiresAt: tPlayer.turnExtensionExpiresAt,
              pausedTime,
              now: Date.now(),
            },
            "Scheduling reconnection timeout"
          )

          user
            .waitReconnection(table.matchSessionId, reconnectDuration, "turn")
            .then(() => {
              const reconnectTime = Date.now()
              let disconnectedDuration = reconnectTime - timedOutAt
              const trucoshiTurn = server.turns.getOrThrow(table.matchSessionId)
              if (
                table.lobby.paused &&
                trucoshiTurn.pausedAt &&
                timedOutAt < trucoshiTurn.pausedAt
              ) {
                disconnectedDuration = trucoshiTurn.pausedAt - timedOutAt
              }
              tPlayer.addDisconnectedTime(disconnectedDuration)
              table.log.trace(
                { matchSessionId: table.matchSessionId, player: tPlayer.getPublicPlayer("log") },
                "Player reconnected"
              )
              table.playerReconnected(tPlayer, user)
              tPlayer.disconnectedAt = null
              if (!table.lobby.paused) {
                turn()
              }
            })
            .catch(() => {
              table.log.trace(
                { matchSessionId: table.matchSessionId, player: tPlayer.getPublicPlayer("log") },
                "Player abandoned after reconnection timeout"
              )
              currentHand.abandonPlayer(tPlayer)
              chat.system(`${tPlayer.name} se retiro de la partida.`, "leave")
              cancel()
            })
            .finally(() => {
              server
                .emitMatchUpdate(table)
                .catch((e) =>
                  log.error(
                    { message: e.message },
                    "Failed to emit match update after waitReconnection resolved or rejected"
                  )
                )
            })
        }, timeoutDuration)
      }
      function retry(pausedTime = 0) {
        if (!player) {
          table.log.error(
            { matchSessionId: table.matchSessionId },
            "Failed to retry turn, player is null"
          )
          return
        }
        if (play.player !== player) {
          table.log.warn(
            {
              matchSessionId: table.matchSessionId,
              originalPlayer: player.getPublicPlayer("log"),
              currentPlayer: play.player?.getPublicPlayer("log"),
            },
            "Retry called with different current player"
          )
        }
        table.log.info(
          {
            matchSessionId: table.matchSessionId,
            player: player.getPublicPlayer("log"),
            pausedTime,
          },
          "Retrying turn"
        )
        turn()
        trucoshiTurn.timeout = createTimeout(pausedTime)
      }
      const trucoshiTurn = new TrucoshiTurn({
        play,
        resolve,
        cancel,
        retry,
        createdAt: Date.now(),
        timeout: createTimeout(0),
      })
      server.turns.set(table.matchSessionId, trucoshiTurn)
      table.log.debug(
        { matchSessionId: table.matchSessionId, turnCreatedAt: trucoshiTurn.createdAt },
        "Turn timeout set"
      )
    },
    onTurn(table, play) {
      table.log.trace(
        { player: play.player?.getPublicPlayer("log"), handIdx: play.handIdx },
        "Turn started"
      )
      return new Promise<void>((resolve) => {
        const session = play.player?.session
        if (!session || !play || !play.player) {
          throw new Error("No session, play instance or player found")
        }

        const player = play.player
        const user = server.sessions.getOrThrow(session)

        const turn = () =>
          server
            .emitWaitingForPlay({ play, table })
            .then(() => {
              resolve()
            })
            .catch((e) => {
              table.log.error(e, "ONTURN CALLBACK ERROR")
              turn()
            })

        server.setTurnTimeout({
          table,
          play,
          user,
          resolve,
          turn,
          cancel: () =>
            server
              .sayCommand({ table, play, player, command: ESayCommand.MAZO }, true)
              .catch((e) => table.log.error(e, "Turn timeout retry say command MAZO failed"))
              .finally(resolve),
        })
      })
    },
    onTruco(table, play) {
      table.log.trace({ player: play.player, handIdx: play.handIdx }, "Truco answer turn started")
      return new Promise<void>((resolve) => {
        const session = play.player?.session
        if (!session || !play || !play.player) {
          throw new Error("No session, play instance or player found")
        }

        const turn = () =>
          server
            .emitWaitingPossibleSay({ play, table })
            .then(() => resolve())
            .catch((e) => {
              table.log.error(e, "ONTRUCO CALLBACK ERROR")
              turn()
            })

        const player = play.player
        const user = server.sessions.getOrThrow(session)

        server.setTurnTimeout({
          table,
          play,
          user,
          resolve,
          turn,
          cancel: () =>
            server
              .sayCommand({ table, play, player, command: EAnswerCommand.NO_QUIERO }, true)
              .catch((e) =>
                table.log.error(e, "Truco turn timeout retry say command NO_QUIERO failed")
              )
              .finally(resolve),
        })
      })
    },
    onFlor(table, play) {
      table.log.trace(
        {
          player: play.player,
          handIdx: play.handIdx,
        },
        "Flor answer turn started"
      )
      return new Promise<void>((resolve) => {
        const session = play.player?.session as string
        if (!session || !play || !play.player) {
          throw new Error("No session, play instance or player found")
        }

        const turn = () =>
          server
            .emitWaitingPossibleSay({ play, table })
            .then(() => resolve())
            .catch((e) => {
              table.log.error(e, "ONFLOR CALLBACK ERROR")
              turn()
            })

        const player = play.player
        const user = server.sessions.getOrThrow(session)

        server.setTurnTimeout({
          table,
          play,
          user,
          resolve,
          turn,
          cancel: () => {
            server
              .sayCommand({ table, play, player, command: ESayCommand.MAZO }, true)
              .catch((e) => table.log.error(e, "Flor turn timeout failed to say FLOR command"))
              .finally(resolve)
          },
        })
      })
    },
    async onFlorBattle(table, play, hand) {
      table.log.trace(
        {
          player: play.player,
          handIdx: play.handIdx,
        },
        "Flor battle turn started"
      )

      const previousHandAckTime = Number(process.env.APP_PREVIOUS_HAND_ACK_TIMEOUT || 0) || 2200

      if (process.env.APP_DISABLE_TIMERS !== "1") {
        await new Promise<void>((resolve) => setTimeout(resolve, previousHandAckTime))
      }

      if (!hand) {
        table.log.error(
          { matchId: table.matchSessionId },
          "Flor battle has null hand object, resolving..."
        )
        return Promise.resolve()
      }

      return server.emitFlorBattle(hand, table)
    },
    onEnvido(table, play, isPointsRound) {
      table.log.trace(
        {
          player: play.player?.getPublicPlayer("log"),
          handIdx: play.handIdx,
          isPointsRound,
        },
        "Envido answer turn started"
      )
      return new Promise<void>((resolve) => {
        const session = play.player?.session as string
        if (!session || !play || !play.player) {
          throw new Error("No session, play instance or player found")
        }

        const turn = () =>
          server
            .emitWaitingPossibleSay({ play, table })
            .then(() => resolve())
            .catch((e) => {
              table.log.error(e, "ONENVIDO CALLBACK ERROR")
              turn()
            })

        const player = play.player
        const user = server.sessions.getOrThrow(session)

        server.setTurnTimeout({
          table,
          play,
          user,
          resolve,
          turn,
          cancel: () => {
            if (isPointsRound) {
              return server
                .sayCommand({ table, play, player, command: 0 }, true)
                .catch((e) =>
                  table.log.error(e, "Envido turn timeout failed to say '0' points command")
                )
                .finally(resolve)
            }
            server
              .sayCommand({ table, play, player, command: EAnswerCommand.NO_QUIERO }, true)
              .catch((e) =>
                table.log.error(e, "Envido turn timeout failed to say NO_QUIERO command")
              )
              .finally(resolve)
          },
        })
      })
    },
    async onHandFinished(table, hand) {
      table.log.debug(
        { handIdx: hand?.idx, rounds: hand?.roundsLogFlatten, points: hand?.points },
        "Match Hand Finished"
      )

      if (process.env.APP_DISABLE_TIMERS !== "1") {
        await server.emitMatchUpdate(table, undefined, true)
        await new Promise((resolve) => setTimeout(resolve, PLAYER_TIMEOUT_GRACE * 2))
      }

      const publicMatch = await server.emitMatchUpdate(table)

      table.lobby.teams.map((team) => {
        server.chat.rooms
          .getOrThrow(table.matchSessionId)
          .system(`${team.name}: +${publicMatch.previousHand?.points[team.id]}`, false)
      })

      if (process.env.APP_DISABLE_TIMERS !== "1") {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, table.lobby.ackTime)
        })
      }

      table.log.trace(
        table.getPublicMatchInfo(),
        "Previous hand timeout has finished, all players settled for next hand"
      )
    },
    onWinner(table, winner) {
      const matchEndTime = Date.now()
      return new Promise<void>((resolve) => {
        table.log.info(table.getPublicMatchInfo(), "Match has finished with a winner")

        const chat = server.chat.rooms.getOrThrow(table.matchSessionId)
        chat.system(`${winner.name} es el equipo ganador!`)

        const winnerIdx = winner.id.toString() as "0" | "1"
        const loserIdx = getOpponentTeam(winner).toString() as "0" | "1"

        if (table.lobby.teams.some((t) => t.points.malas === 0)) {
          chat.sound("flawless")
        }

        chat.sound("winner", winnerIdx)
        chat.sound("deal", loserIdx)
        chat.sound("ceba_toma_mate", loserIdx)

        server
          .emitMatchUpdate(table)
          .then(() =>
            server.getTableSockets(table, async (playerSocket, player) => {
              if (player) {
                const activeMatches = server.getSessionActiveMatches(player.session)
                table.log.trace({ activeMatches }, "Match finished, updating active matches")
                playerSocket.emit(EServerEvent.UPDATE_ACTIVE_MATCHES, activeMatches)
              }
            })
          )
          .catch((e) => {
            table.log.error(e, "ONWINNER CALLBACK ERROR")
            resolve()
          })

        server.io.to("searching").emit(EServerEvent.UPDATE_PUBLIC_MATCHES, server.tables.getAll())

        function cleanup() {
          const buffer = 5000
          const lastMessageDate = chat.messages.at(-1)?.date
          if (lastMessageDate && lastMessageDate * 1000 > matchEndTime + buffer) {
            const now = Date.now()
            const diff = now - lastMessageDate * 1000
            if (diff < MATCH_FINISHED_CLEANUP_TIMEOUT) {
              const remainingTime = MATCH_FINISHED_CLEANUP_TIMEOUT - diff
              setTimeout(cleanup, remainingTime)
              return
            }
          }

          setTimeout(() => {
            server.cleanupMatchTable(table)
            resolve()
          }, 3 * 1000)
        }

        setTimeout(cleanup, MATCH_FINISHED_CLEANUP_TIMEOUT)
      })
    },
    async createMatchTable(userSession, socket) {
      let matchSessionId = getWordsId()
      while (server.tables.get(matchSessionId)) {
        matchSessionId = getWordsId()
      }

      const table = MatchTable(matchSessionId, userSession)

      server.chat.create(table.matchSessionId)
      socket.join(table.matchSessionId)

      table.log.debug(userSession.getPublicInfo(), "User has created a new match table")

      userSession.ownedMatches.add(matchSessionId)

      await table.lobby.addPlayer({
        accountId: userSession.account?.id,
        key: userSession.key,
        name: userSession.name,
        session: userSession.session,
        avatarUrl: userSession.account?.avatarUrl,
        isOwner: true,
        teamIdx: 0,
      })

      if (server.store) {
        const ownerAccountId = userSession.account?.id

        const dbMatch = await server.store.match.create({
          data: {
            ownerAccountId,
            sessionId: matchSessionId,
            options: table.lobby.options as unknown as Prisma.JsonObject,
          },
          select: { id: true },
        })

        table.setMatchId(dbMatch.id)
      }

      server.tables.set(matchSessionId, table)

      server.io.to("searching").emit(EServerEvent.UPDATE_PUBLIC_MATCHES, server.tables.getAll())

      return table
    },
    async addBot(table, userSession, teamIdx) {
      if (table.busy || table.lobby.options.satsPerPlayer > 0) {
        throw new Error("Can't add bots while betting sats")
      }

      if (table.ownerSession !== userSession.session) {
        throw new Error("User is not the match owner, can't add a bot")
      }

      let name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]

      while (table.lobby.players.find((p) => p.bot && p.name === name)) {
        name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]
      }

      const bot = await table.lobby.addPlayer({
        key: randomUUID(),
        name,
        session: randomUUID(),
        isOwner: false,
        bot: name,
        teamIdx,
      })

      const botSession = UserSession(bot.key, bot.name, bot.session)
      server.sessions.set(bot.session, botSession)

      await server.setMatchPlayerReady({
        matchSessionId: table.matchSessionId,
        ready: true,
        userSession: botSession,
      })

      server.io.to("searching").emit(EServerEvent.UPDATE_PUBLIC_MATCHES, server.tables.getAll())

      return bot
    },
    async checkUserSufficientBalance({ identityJwt, account, satsPerPlayer }) {
      const payload = validateJwt(identityJwt, account)
      const wallet = await accountsApi.users.getUserWallet(String(payload.sub))

      if (wallet.data.balanceInSats < satsPerPlayer) {
        throw new Error(GAME_ERROR.INSUFFICIENT_BALANCE)
      }

      return true
    },
    async setMatchOptions({ socket, matchSessionId, userSession, options, emitChat = true }) {
      if (!userSession.ownedMatches.has(matchSessionId)) {
        throw new Error("User is not the match owner, can't set options")
      }

      const table = server.tables.getOrThrow(matchSessionId)
      if (table.lobby.started) {
        throw new Error("Match already started, can't change options")
      }

      const satsPerPlayer = options.satsPerPlayer
      const currentOptions = structuredClone(table.lobby.options)
      const hasChangedBet =
        satsPerPlayer !== undefined && currentOptions.satsPerPlayer !== satsPerPlayer

      if (!hasChangedBet) {
        // No bet change, just update options
        table.lobby.setOptions(options)
        await server.store?.match.update({
          data: { options: table.lobby.options as unknown as Prisma.JsonObject },
          where: { id: table.matchId },
        })

        if (emitChat) {
          server.chat.rooms.getOrThrow(matchSessionId).system("Las reglas han cambiado", "chat")
        }

        await server.emitMatchUpdate(table)
        return table
      }

      if (!server.store) {
        throw new Error("This server doesn't support bets")
      }

      if (satsPerPlayer !== undefined && satsPerPlayer > 0) {
        // Validate new bet
        if (
          process.env.APP_MAX_BET &&
          Number(process.env.APP_MAX_BET) > 0 &&
          satsPerPlayer > Number(process.env.APP_MAX_BET)
        ) {
          throw new SocketError("FORBIDDEN", `Máximo ${process.env.APP_MAX_BET} sats`)
        }
        if (!socket.data.identity || !userSession.account) {
          throw new SocketError("FORBIDDEN", "Inicia sesión para usar sats!")
        }
        await server.checkUserSufficientBalance({
          identityJwt: socket.data.identity,
          account: userSession.account,
          satsPerPlayer,
        })
      }

      table.setBusy(true)
      let payRequests: PayRequest[] = []
      try {
        await server.store.$transaction(
          async (tx) => {
            const dbMatch = await tx.match.findUniqueOrThrow({
              where: { id: table.matchId },
              include: { players: true, bet: true },
            })

            // Refund existing bets if necessary
            if (dbMatch.bet && dbMatch.bet.satsPerPlayer > 0 && hasChangedBet) {
              for (const player of dbMatch.players) {
                if (player.payRequestId && player.satsPaid > 0) {
                  let pr
                  try {
                    pr = await accountsApi.wallet.getPayRequest(String(player.payRequestId))
                  } catch (e) {
                    table.log.error(e, `Failed to fetch pay request ${player.payRequestId}`)
                    throw new SocketError("UNEXPECTED_ERROR", "Failed to fetch pay request")
                  }

                  if (pr.data.paid) {
                    await tx.matchPlayer.update({
                      where: { id: player.id },
                      data: { satsPaid: 0, payRequestId: null },
                    })

                    await accountsApi.wallet.payUser({
                      amountInSats: pr.data.amountInSats,
                      userId: player.accountId!,
                      description: `Returning bet due to bet change in match ID: ${table.matchId}`,
                    })

                    table.log.info(
                      {
                        matchId: table.matchId,
                        sessionId: matchSessionId,
                        playerAccountId: player.accountId,
                        amountInSats: pr.data.amountInSats,
                      },
                      "Refunded bet to player due to bet change"
                    )
                  }
                }
              }

              if (dbMatch.bet) {
                await tx.matchBet.update({
                  where: { id: dbMatch.bet.id },
                  data: { refunded: true, allPlayersPaid: false },
                })
              }
            }

            // Set new options and create new payment requests if bet is active
            if (satsPerPlayer !== undefined && satsPerPlayer > 0) {
              const guestSessions = table.lobby.players
                .filter((p) => !p.accountId)
                .map((u) => u.session)
              for (const session of guestSessions) {
                await table.lobby.removePlayer(session)
              }
              await server.getTableSockets(table, async (playerSocket) => {
                if (
                  playerSocket.data.user &&
                  guestSessions.includes(playerSocket.data.user.session)
                ) {
                  playerSocket.emit(
                    EServerEvent.KICK_PLAYER,
                    table.getPublicMatch(playerSocket.data.user.session),
                    playerSocket.data.user.session,
                    GAME_ERROR.GAME_REQUIRES_ACCOUNT
                  )
                }
              })

              const prs = await accountsApi.wallet.createPayRequests({
                amountInSats: satsPerPlayer,
                description: `Request to enter match ${matchSessionId} - Match ID: ${table.matchId}`,
                meta: { application: "trucoshi", matchSessionId, matchId: table.matchId },
                receiverIds: table.lobby.players
                  .filter((p) => !!p.accountId)
                  .map((p) => p.accountId) as number[],
              })
              payRequests = prs.data

              await tx.match.update({
                data: {
                  options: {
                    ...table.lobby.options,
                    satsPerPlayer,
                  } as unknown as Prisma.JsonObject,
                  bet: {
                    upsert: {
                      create: {
                        allPlayersPaid: false,
                        winnerAwarded: false,
                        refunded: false,
                        satsPerPlayer,
                      },
                      update: {
                        allPlayersPaid: false,
                        winnerAwarded: false,
                        refunded: false,
                        satsPerPlayer,
                      },
                    },
                  },
                },
                where: { id: table.matchId },
              })
            } else {
              // No bet (satsPerPlayer === 0)
              await tx.match.update({
                data: {
                  options: {
                    ...table.lobby.options,
                    satsPerPlayer: 0,
                  } as unknown as Prisma.JsonObject,
                },
                where: { id: table.matchId },
              })
            }

            table.lobby.setOptions(options)
            table.lobby.players.forEach((player) => {
              if (!player.bot) {
                player.setPayRequest(
                  payRequests.find((pr) => pr.receiver?.id === player.accountId)?.id
                )
                player.setReady(false)
              }
            })
          },
          { timeout: 60000 }
        )
      } catch (e) {
        table.lobby.setOptions(currentOptions)
        table.log.error(e, "Failed to update match options")
        throw new SocketError("UNEXPECTED_ERROR", "Failed to update match options")
      } finally {
        table.setBusy(false)
      }

      server.chat.rooms
        .getOrThrow(matchSessionId)
        .system("Las reglas han cambiado", hasChangedBet ? "bot" : "chat")
      await server.emitMatchUpdate(table)
      return table
    },
    async pauseMatch({ matchSessionId, userSession, pause }) {
      const table = server.tables.getOrThrow(matchSessionId)
      const chat = server.chat.rooms.getOrThrow(matchSessionId)

      const player = userSession
        ? table.isSessionPlaying(userSession.session)
        : {
            teamIdx: 0 as 0 | 1,
            getPublicPlayer() {
              return { pausedByAdmin: true }
            },
          }

      if (!player) {
        table.log.error(
          { matchSessionId, userSession: userSession?.session },
          "Player not found in match for pause/unpause"
        )
        throw new SocketError("FORBIDDEN")
      }

      table.log.trace(
        { matchSessionId, player: player.getPublicPlayer("log"), pause, state: table.state() },
        "Processing pause/unpause request"
      )

      if (pause) {
        if (table.lobby.pauseRequest) {
          table.log.warn(
            { matchSessionId, player: player.getPublicPlayer("log") },
            "Pause request already pending, ignoring new request"
          )
          return false
        }

        const promise = table.lobby
          .requestPause(player.teamIdx, true)
          .then(() => {
            if (!table.lobby.pauseRequest) {
              table.log.error({}, "Failed to find pause request in lobby")
              return false
            }

            const turn = server.turns.getOrThrow(matchSessionId)
            table.log.trace(
              {
                matchSessionId,
                turnPlayer: turn.play.player?.getPublicPlayer("log"),
                turnTimeout: !!turn.timeout,
                pausedAt: turn.pausedAt,
                pausingPlayer: player.getPublicPlayer("log"),
              },
              "Pausing match, clearing turn timeout"
            )
            turn.timeout && clearTimeout(turn.timeout)
            turn.pausedAt = Date.now()
            server.sessions
              .getOrThrow(turn.play.player?.session)
              .clearTimeout(matchSessionId, "turn")
            server
              .emitMatchUpdate(table)
              .catch((e) =>
                table.log.error({ message: e.message }, "Failed to emit UPDATE_MATCH after pause")
              )

            table.lobby.pauseRequest.pauseTimeout = setTimeout(() => {
              server.pauseMatch({ matchSessionId, pause: false })
            }, PLAYER_ABANDON_TIMEOUT)

            chat.system("La partida esta en pausa.", "menu0")

            return true
          })
          .catch((e) => {
            table.lobby.pauseRequest = undefined
            table.log.error({ message: e.message }, "Failed to pause match")
            return false
          })

        const expiresAt = Date.now() + PAUSE_REQUEST_TIMEOUT

        const pauseRequestTimeout = setTimeout(() => {
          if (table.lobby.pauseRequest) {
            table.lobby.pauseRequest.decline()
            table.lobby.pauseRequest = undefined
          }
        }, PAUSE_REQUEST_TIMEOUT)

        setTimeout(() => {
          server
            .getTableSockets(table, async (socket, socketPlayer) => {
              if (socketPlayer && table.lobby.pauseRequest) {
                socket.emit(
                  EServerEvent.PAUSE_MATCH_REQUEST,
                  table.matchSessionId,
                  table.lobby.pauseRequest.fromTeamIdx !== socketPlayer?.teamIdx,
                  expiresAt,
                  (answer) => {
                    if (
                      table.lobby.pauseRequest &&
                      table.lobby.pauseRequest.fromTeamIdx !== socketPlayer?.teamIdx
                    ) {
                      if (answer) {
                        table.lobby.pauseRequest.accept()
                      } else {
                        table.lobby.pauseRequest.decline()
                      }

                      server.getTableSockets(table, async (socket) => {
                        socket.emit(EServerEvent.UNPAUSE_STARTED, table.matchSessionId, 0)
                      })
                    }
                  }
                )
              }
            })
            .catch((e) =>
              log.fatal(
                { message: e.message, matchSessionId },
                "Failed to get sockets for pause request"
              )
            )
        })

        return promise.finally(() => clearTimeout(pauseRequestTimeout))
      }

      return table.lobby
        .requestPause(player.teamIdx, false, (unpausesAt) => {
          server.getTableSockets(table, async (socket) => {
            socket.emit(EServerEvent.UNPAUSE_STARTED, table.matchSessionId, unpausesAt)
          })
        })
        .then(() => {
          const turn = server.turns.getOrThrow(matchSessionId)
          const pausedTime = turn.pausedAt ? Date.now() - turn.pausedAt : 0
          turn.pausedAt = undefined
          if (turn.play.player) {
            const previousTurnExpiresAt = turn.play.player.turnExpiresAt
            const previousTurnExtensionExpiresAt = turn.play.player.turnExtensionExpiresAt
            turn.play.player.delayTurnExpiration(pausedTime)
            if (
              userSession?.timeouts.turn.has(matchSessionId) &&
              turn.play.player.turnExtensionExpiresAt
            ) {
              if (turn.play.player.disconnectedAt) {
                turn.play.player.disconnectedAt += pausedTime
              }
              const remaining = Math.max(
                turn.play.player.turnExtensionExpiresAt -
                  Date.now() -
                  turn.play.player.abandonedTime,
                PLAYER_TIMEOUT_GRACE
              )
              userSession.resumeTimeout(matchSessionId, "turn", remaining)
            }
            table.log.trace(
              {
                matchSessionId,
                player: turn.play.player.getPublicPlayer("log"),
                pausedTime,
                previousTurnExpiresAt,
                previousTurnExtensionExpiresAt,
                newTurnExpiresAt: turn.play.player.turnExpiresAt,
                newTurnExtensionExpiresAt: turn.play.player.turnExtensionExpiresAt,
                now: Date.now(),
                isInExtensionPeriod: Date.now() >= (turn.play.player.turnExpiresAt || 0),
              },
              "Extended timers after unpause"
            )
          } else {
            table.log.warn(
              { matchSessionId, currentPlayer: player.getPublicPlayer("log") },
              "No player found for turn during unpause"
            )
          }

          chat.system("La partida se ha reanudado...")

          turn.retry(pausedTime)
          server
            .emitMatchUpdate(table)
            .catch((e) =>
              table.log.error({ message: e.message }, "Failed to emit UPDATE_MATCH after unpause")
            )
          return false
        })
        .catch((e) => {
          table.log.error({ message: e.message, matchSessionId }, "Failed to unpause match")
          return false
        })
        .finally(() => {
          table.lobby.pauseRequest = undefined
        })
    },
    async kickPlayer({ matchSessionId, userSession, key }) {
      const table = server.tables.getOrThrow(matchSessionId)
      const player = table.isSessionPlaying(userSession.session)

      if (!player || table.playing()) {
        throw new SocketError("FORBIDDEN")
      }

      const is_allowed = player.isOwner || (!player.isOwner && player.key === key)

      if (!is_allowed || table.busy) {
        throw new SocketError("FORBIDDEN")
      }

      const kickedPlayer = table.lobby.players.find((p) => p.key === key)

      if (!kickedPlayer?.session) {
        throw new SocketError("NOT_FOUND")
      }

      await table.lobby.removePlayer(kickedPlayer.session)

      if (kickedPlayer.bot) {
        server.sessions.delete(kickedPlayer.session)
      }

      server
        .emitMatchUpdate(table)
        .catch((e) =>
          table.log.error({ message: e.message }, "Emit update after kick player failed")
        )

      server.chat.rooms
        .getOrThrow(table.matchSessionId)
        .system(
          `${kickedPlayer.name} salió de ${table.lobby.teams[kickedPlayer.teamIdx].name}`,
          kickedPlayer.bot ? "bot" : "miss"
        )
    },
    async setMatchPlayerReady({ matchSessionId, userSession, ready }) {
      const table = server.tables.getOrThrow(matchSessionId)
      const player = table.isSessionPlaying(userSession.session)

      if (!player) {
        throw new Error("Player not found in match, can't set ready status")
      }

      let pr: PayRequest | null = null

      let dbPlayerExists: MatchPlayer | null = null
      if (server.store) {
        // Fetch dbPlayerExists at the start to ensure it's in scope for all operations
        dbPlayerExists = await server.store.matchPlayer.findFirst({
          where: userSession.account
            ? { accountId: userSession.account.id, matchId: table.matchId }
            : { session: userSession.session, matchId: table.matchId },
        })

        if (ready && table.lobby.options.satsPerPlayer > 0) {
          if (!userSession.account) {
            throw new SocketError(
              "GAME_REQUIRES_ACCOUNT",
              "Necesitas iniciar sesion para usar sats"
            )
          }

          // Check if player already paid
          if (dbPlayerExists && dbPlayerExists.satsPaid > 0 && dbPlayerExists.payRequestId) {
            table.log.debug(
              {
                player: player.getPublicPlayer(),
                payRequestId: dbPlayerExists.payRequestId,
                satsPaid: dbPlayerExists.satsPaid,
              },
              "Player already paid, skipping payment validation"
            )
          } else {
            if (!player.payRequestId) {
              throw new Error("Player doesn't have a pay request ID!")
            }

            try {
              const res = await accountsApi.wallet.getPayRequest(String(player.payRequestId))
              pr = res.data
              table.log.debug({ pr }, "Found PR for setting player ready")

              if (!pr) {
                throw new Error("Pay request not found!")
              }

              if (!pr.paid) {
                throw new Error("Pay request has not been paid!")
              }

              table.setBusy(true)
            } catch (e: any) {
              table.log.error(
                { error: e.message, payRequestId: player.payRequestId },
                "Failed to validate payment request"
              )
              throw new SocketError("PAYMENT_ERROR", "Failed to validate payment request")
            }
          }
        }

        const update = {
          session: userSession.session,
          accountId: userSession.account?.id,
          name: userSession.name,
          teamIdx: player.teamIdx,
          bot: !!player.bot,
        } as Pick<
          MatchPlayer,
          "session" | "accountId" | "name" | "teamIdx" | "payRequestId" | "satsPaid" | "bot"
        >

        if (pr && pr.id) {
          update.satsPaid = pr.amountInSats
          update.payRequestId = pr.id
        }

        table.log.trace({ update }, "About to update or create match player")

        try {
          if (dbPlayerExists) {
            const dbPlayer = await server.store.matchPlayer.update({
              where: { id: dbPlayerExists.id },
              data: update,
            })
            player.setMatchPlayerId(dbPlayer.id)
            table.log.trace({ dbPlayer }, "Updated match player")
          } else {
            const dbPlayer = await server.store.matchPlayer.create({
              data: {
                ...update,
                match: {
                  connect: {
                    id: table.matchId,
                  },
                },
              },
            })
            player.setMatchPlayerId(dbPlayer.id)
            table.log.trace({ dbPlayer }, "Created match player")
          }
        } catch (e: any) {
          table.log.error({ error: e.message }, "Failed to update or create match player")
          throw new SocketError("UNEXPECTED_ERROR", "Failed to update player data")
        }
      }

      try {
        player.setReady(ready)

        if (player.bot) {
          server.chat.rooms
            .get(table.matchSessionId)
            ?.system(
              `${player.name} ${ready ? "está" : "no está"} listo`,
              ready ? "botvoice" : "bot"
            )
        } else {
          server.chat.rooms
            .get(table.matchSessionId)
            ?.system(`${player.name} ${ready ? "está" : "no está"} listo`, ready ? "join" : "leave")
        }

        await server.emitMatchUpdate(table)
      } catch (e: any) {
        table.log.error({ message: e.message }, "Failed to set player ready or emit match update")
        throw new SocketError("UNEXPECTED_ERROR", "Failed to set player ready")
      } finally {
        if (table.busy) {
          table.log.debug({ matchSessionId: table.matchSessionId }, "Resetting busy flag")
          table.setBusy(false)
        }
      }

      return table
    },
    async joinMatch(table, userSession, socket, teamIdx) {
      let prId: number | undefined
      let matchPlayerId: number | undefined
      if (table.lobby.options.satsPerPlayer > 0) {
        if (!userSession.account?.id || !socket.data.identity) {
          throw new Error("Player needs to be logged into an account to join this match")
        }

        const currentPlayer = table.isSessionPlaying(userSession.session)

        await server.checkUserSufficientBalance({
          identityJwt: socket.data.identity,
          account: userSession.account,
          satsPerPlayer: table.lobby.options.satsPerPlayer,
        })

        if (currentPlayer) {
          matchPlayerId = currentPlayer.matchPlayerId
          prId = currentPlayer.payRequestId
        } else {
          const res = await accountsApi.wallet.createPayRequest({
            amountInSats: table.lobby.options.satsPerPlayer,
            receiverId: userSession.account.id,
            description: `Request to enter match ${table.matchSessionId} - Match ID: ${table.matchId}`,
            meta: {
              application: "trucoshi",
              matchSessionId: table.matchSessionId,
              matchId: table.matchId,
            },
          })

          prId = res.data.id
        }
      }

      const player = await table.lobby.addPlayer({
        accountId: userSession.account?.id,
        avatarUrl: userSession.account?.avatarUrl,
        key: userSession.key,
        name: userSession.name,
        session: userSession.session,
        isOwner: userSession.ownedMatches.has(table.matchSessionId),
        teamIdx,
      })

      socket.join(table.matchSessionId)
      socket.join(table.matchSessionId + player.teamIdx)
      socket.leave(table.matchSessionId + getOpponentTeam(player.teamIdx))

      server.emitMatchUpdate(table).catch(console.error)

      player.setPayRequest(prId)
      player.setMatchPlayerId(matchPlayerId)

      server.chat.rooms
        .get(table.matchSessionId)
        ?.system(
          `${player.name} se unió al equipo ${table.lobby.teams[player.teamIdx].name}`,
          "notification"
        )

      server.io.to("searching").emit(EServerEvent.UPDATE_PUBLIC_MATCHES, server.tables.getAll())

      return player
    },
    async cleanupUserTables(userSession) {
      const ownedTables = server.tables.findAll((t) => t.ownerSession === userSession.session)

      for (const table of ownedTables) {
        if (table.state() === EMatchState.UNREADY) {
          await server.cleanupMatchTable(table)
        }
      }
    },
    async startMatch({ identityJwt, matchSessionId, userSession }) {
      const table = server.tables.getOrThrow(matchSessionId)

      if (!table) {
        throw new Error("MatchTable not found")
      }

      if (table.lobby.gameLoop) {
        throw new Error("MatchTable gameloop already exists")
      }

      await server.resetSocketsMatchState(table)

      const hasBet = table.lobby.options.satsPerPlayer > 0

      if (hasBet) {
        if (!identityJwt || !userSession.account) {
          throw new Error("User is not logged in, can't start match!")
        }

        validateJwt(identityJwt, userSession.account)

        const payRequestIds = table.lobby.players.map((player) => {
          if (!player.payRequestId) {
            throw new Error("One or more players don't have a pay request associated")
          }
          return player.payRequestId
        })

        const prs = await accountsApi.wallet.getPayRequests({
          payRequestIds,
        })

        if (prs.data.some((pr) => !pr.paid)) {
          throw new Error("One or more players didn't pay their associated pay request")
        }
      }

      const ownerSession = server.sessions.getOrThrow(table.ownerSession)

      const ownerAccountId =
        userSession.account && ownerSession.account?.id === userSession.account.id
          ? userSession.account.id
          : undefined

      if (server.store) {
        await server.store.match.update({
          data: {
            ownerAccountId,
            state: EMatchState.STARTED,
            options: table.lobby.options as unknown as Prisma.JsonObject,
            bet: hasBet
              ? {
                  update: {
                    allPlayersPaid: true,
                    winnerAwarded: false,
                    satsPerPlayer: table.lobby.options.satsPerPlayer,
                  },
                }
              : undefined,
            players: {
              update: table.lobby.players.map((player, idx) => {
                player.setIdx(idx)
                return {
                  where: { id: player.matchPlayerId },
                  data: {
                    idx,
                  },
                }
              }),
            },
          },
          where: {
            id: table.matchId,
          },
          include: {
            players: true,
          },
        })
      } else {
        for (const [idx, player] of table.lobby.players.entries()) {
          player.setIdx(idx)
        }
      }

      table.log.info(table.getPublicMatchInfo(), "Match started")

      await server.cleanupUserTables(userSession)

      table.lobby
        .startMatch()
        .onHandFinished(async (hand) => {
          if (server.store && hand) {
            await server.store.matchHand.create({
              data: {
                clientSecrets: hand.clientSecrets,
                secret: hand.secret,
                bitcoinHash: hand.bitcoinHash,
                bitcoinHeight: hand.bitcoinHeight,
                trucoWinnerIdx: hand.trucoWinnerIdx,
                envidoWinnerIdx: hand.envidoWinnerIdx,
                florWinnerIdx: hand.florWinnerIdx,
                idx: hand.idx,
                rounds: hand.roundsLog as unknown as Prisma.JsonArray,
                results: hand.points as unknown as Prisma.JsonObject,
                match: {
                  connect: {
                    id: table.matchId,
                  },
                },
              },
              select: { id: true },
            })
          }

          return server.onHandFinished(table, hand)
        })
        .onTurn(server.onTurn.bind(null, table))
        .onBotTurn(server.onBotTurn.bind(null, table))
        .onEnvido(server.onEnvido.bind(null, table))
        .onTruco(server.onTruco.bind(null, table))
        .onFlor(server.onFlor.bind(null, table))
        .onFlorBattle(server.onFlorBattle.bind(null, table))
        .onWinner(async (winnerTeam, points) => {
          if (server.store) {
            if (!table.matchId) {
              throw new Error("Match ID not found!")
            }

            await server.store.$transaction(async (tx) => {
              const dbMatch = await tx.match.update({
                data: {
                  state: EMatchState.FINISHED,
                  results: points as unknown as Prisma.JsonArray,
                  winnerIdx: winnerTeam.id,
                },
                where: {
                  id: table.matchId,
                },
                include: { bet: true },
              })

              if (table.lobby.players.some((player) => player.bot)) {
                return
              }

              for (const player of table.lobby.players) {
                if (!player.accountId) {
                  continue
                }

                const isWinner =
                  winnerTeam.players
                    .filter((p) => !p.abandoned)
                    .findIndex((p) => p.accountId === player.accountId) !== -1

                const satsBet = dbMatch.bet?.satsPerPlayer || 0

                await server.store?.userStats.upsert({
                  where: { accountId: player.accountId },
                  create: {
                    accountId: player.accountId,
                    loss: isWinner ? 0 : 1,
                    win: isWinner ? 1 : 0,
                    satsBet,
                    satsLost: isWinner ? 0 : satsBet,
                    satsWon: isWinner ? satsBet : 0,
                  },
                  update: {
                    loss: { increment: isWinner ? 0 : 1 },
                    win: { increment: isWinner ? 1 : 0 },
                    satsBet: { increment: satsBet },
                    satsLost: { increment: isWinner ? 0 : satsBet },
                    satsWon: { increment: isWinner ? satsBet : 0 },
                  },
                })
              }
            })

            const satsPerPlayer = table.lobby.options.satsPerPlayer
            if (satsPerPlayer > 0) {
              try {
                const rake = Number(process.env.APP_RAKE_PERCENT) || 0
                const pool = satsPerPlayer * table.lobby.players.length
                const tax = Math.round((pool * rake) / 100) || rake
                const prize = pool - tax
                const winnersLength = winnerTeam.players.filter((p) => !p.abandoned).length
                const amountInSats = Math.floor(prize / winnersLength)

                table.log.debug(
                  { pool, tax, prize, amountInSats, winnersLength, rake },
                  "Paying winner award"
                )

                for (const player of winnerTeam.players) {
                  if (!player.accountId) {
                    continue
                  }
                  await server.store.$transaction(async (tx) => {
                    await tx.matchPlayer.update({
                      where: { id: player.matchPlayerId },
                      data: { satsReceived: amountInSats },
                    })

                    await accountsApi.wallet.payUser({
                      amountInSats,
                      userId: player.accountId!,
                      description: `Awarding match prize ID: ${table.matchId}`,
                    })

                    log.info(
                      { pool, tax, prize, amountInSats, winnersLength, rake },
                      "Match winner received award"
                    )
                  })
                }

                await server.store.matchBet.update({
                  where: { matchId: table.matchId },
                  data: { winnerAwarded: true },
                })

                table.setAwardedPerPlayer(amountInSats)
              } catch (e) {
                table.log.fatal(e, "ON WINNER: Failed to pay awards!")
              }
            }

            server
              .getRanking()
              .catch((e: any) =>
                logger.error({ message: e.message }, "Failed to get ranking after match ended")
              )
          }

          return server.onWinner(table, winnerTeam)
        })
        .begin()
        .then(() => table.log.info(table.getPublicMatchInfo(), "Match finished"))
        .catch((e) => table.log.error(e, "Lobby match loop failed"))

      server.tables.set(matchSessionId as string, table)

      server
        .getTableSockets(table, async (playerSocket, player) => {
          if (player) {
            playerSocket.emit(
              EServerEvent.UPDATE_ACTIVE_MATCHES,
              server.getSessionActiveMatches(player.session)
            )
          }
        })
        .catch(table.log.error)

      server.io.to("searching").emit(EServerEvent.UPDATE_PUBLIC_MATCHES, server.tables.getAll())
    },
    async playAgain({ matchSessionId, userSession, socket }) {
      const table = server.tables.getOrThrow(matchSessionId)

      if (!socket.data.user) {
        return
      }

      if (table.lobby.playAgainRequest) {
        table.lobby.playAgainRequest.acceptedBySessions.add(userSession.session)
        const match = server.tables.getOrThrow(table.lobby.playAgainRequest.newMatchSessionId)

        const possible = _getPossiblePlayingMatch(match.matchSessionId, socket.data.user.session)

        if (!possible?.player && !match.playing()) {
          await server.joinMatch(match, userSession, socket)
        }
      } else {
        const newTable = await server.createMatchTable(userSession, socket)

        table.lobby.playAgainRequest = {
          acceptedBySessions: new Set<string>([userSession.session]),
          newMatchSessionId: newTable.matchSessionId,
        }

        await server.setMatchOptions({
          matchSessionId: newTable.matchSessionId,
          options: table.lobby.options,
          socket,
          userSession,
          emitChat: false,
        })

        server.getTableSockets(table, async (playerSocket, player) => {
          if (player && player.session !== userSession.session) {
            playerSocket.emit(
              EServerEvent.PLAY_AGAIN_REQUEST,
              matchSessionId,
              Date.now() + PAUSE_REQUEST_TIMEOUT
            )
          }
        })
      }

      socket.emit(
        EServerEvent.UPDATE_ACTIVE_MATCHES,
        server.getSessionActiveMatches(userSession.session)
      )

      return table.lobby.playAgainRequest.newMatchSessionId
    },
    emitSocketMatch(socket, matchId) {
      if (!matchId) {
        return null
      }

      const table = server.tables.get(matchId)

      if (table) {
        socket.join(table.matchSessionId)

        if (!socket.data.user?.session) {
          return null
        }

        if (socket.data.matches) {
          socket.data.matches.set(table.matchSessionId, {
            isWaitingForPlay: false,
            isWaitingForSay: false,
          })
        }

        const userSession = server.sessions.get(socket.data.user.session)

        if (!userSession) {
          log.warn({ socket: socket.id, matchId }, "Session not found")
          return null
        }

        userSession.reconnect(table.matchSessionId, "disconnection")

        const { play, resolve } = server.turns.get(table.matchSessionId) || {}
        const player = table.isSessionPlaying(socket.data.user.session)
        if (play && play.player && player) {
          socket.join(table.matchSessionId + player.teamIdx)

          if (
            play.state === EHandState.WAITING_PLAY &&
            socket.data.user.session === play.player.session
          ) {
            log.trace(
              {
                ...socket.data.user,
                socket: socket.id,
              },
              "Emitting user's socket current playing match: waiting for play"
            )
            server
              .emitWaitingForPlay({ play, table, onlyThisSocket: socket.id })
              .then(resolve)
              .catch(log.error)
          } else {
            log.trace(
              {
                ...socket.data.user,
                socket: socket.id,
              },
              "Emitting user's socket current playing match: waiting possible say"
            )
            server
              .emitWaitingPossibleSay({ play, table, onlyThisSocket: socket.id })
              .then(resolve)
              .catch(log.error)
          }
        }

        return table.getPublicMatch(socket.data.user.session)
      }
      return null
    },
    async deletePlayerAndReturnBet(table, player) {
      try {
        if (!server.store) {
          table.log.error(
            { player, matchSessionId: table.matchSessionId },
            "No database store available"
          )
          return
        }

        if (!player.accountId) {
          table.log.trace(
            { player, matchSessionId: table.matchSessionId },
            "Player has no accountId, skipping refund"
          )
          return
        }

        if (player.satsPaid <= 0 || !player.payRequestId) {
          table.log.trace(
            { player, matchSessionId: table.matchSessionId },
            "Player has no paid bets or payRequestId, skipping refund"
          )
          await server.store.matchPlayer.delete({ where: { id: player.id } })
          return
        }

        const pr = await accountsApi.wallet.getPayRequest(String(player.payRequestId))
        if (!pr.data.paid) {
          table.log.error(
            { matchId: table.matchId, payRequestId: player.payRequestId },
            "Pay request was not marked as paid"
          )
          await server.store.matchPlayer.delete({ where: { id: player.id } })
          return
        }

        await server.store.$transaction(async (tx) => {
          // Ensure matchBet exists
          let matchBet = await tx.matchBet.findUnique({ where: { matchId: table.matchId } })
          if (table.matchId && !matchBet && player.satsPaid > 0) {
            matchBet = await tx.matchBet.create({
              data: {
                matchId: table.matchId,
                allPlayersPaid: false,
                winnerAwarded: false,
                refunded: false,
                satsPerPlayer: player.satsPaid,
              },
            })
            table.log.info(
              { matchId: table.matchId, betId: matchBet.id },
              "Created matchBet record during player refund"
            )
          }

          // Log balance before refund
          const walletBefore = await accountsApi.users.getUserWallet(String(player.accountId))
          table.log.debug(
            { playerAccountId: player.accountId, balanceBefore: walletBefore.data.balanceInSats },
            "Wallet balance before refund"
          )

          // Update player record
          await tx.matchPlayer.update({
            where: { id: player.id },
            data: { satsPaid: 0, payRequestId: null },
          })

          // Refund the exact amount paid
          await accountsApi.wallet.payUser({
            amountInSats: pr.data.amountInSats,
            userId: player.accountId!,
            description: `Returning bet from leaving match ID: ${table.matchId}`,
          })

          // Log balance after refund
          const walletAfter = await accountsApi.users.getUserWallet(String(player.accountId))
          table.log.debug(
            {
              playerAccountId: player.accountId,
              balanceAfter: walletAfter.data.balanceInSats,
              amountRefunded: pr.data.amountInSats,
            },
            "Wallet balance after refund"
          )

          // Check remaining players
          const remainingPlayers = await tx.matchPlayer.findMany({
            where: { matchId: table.matchId },
          })

          if (matchBet) {
            if (remainingPlayers.length === 0) {
              await tx.matchBet.update({
                where: { id: matchBet.id },
                data: { refunded: true },
              })
              table.log.info(
                { matchId: table.matchId, sessionId: table.matchSessionId },
                "All players left, marked matchBet as refunded"
              )
            }
          }

          table.log.info(
            {
              matchId: table.matchId,
              sessionId: table.matchSessionId,
              playerAccountId: player.accountId,
              amountInSats: pr.data.amountInSats,
            },
            "Sent sats from bet back to player"
          )
        })
      } catch (e) {
        table.log.fatal(e, "Failed to return bet sats to player!")
        throw e
      }
    },
    async leaveMatch(matchId, socket, force = false) {
      const table = server.tables.get(matchId)

      if (!table) {
        log.error({ matchId, socket: socket.id }, "Socket left a match but it doesn't exist")
        return
      }

      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)
        const player = table.isSessionPlaying(userSession.session)
        const turn = server.turns.get(table.matchSessionId)

        if (!player) {
          table.log.trace({ matchId, socket: socket.id }, "Socket left a match but isn't in it")
          return
        }

        if (table.state() === EMatchState.FINISHED) {
          table.log.trace(
            { matchId, socket: socket.id },
            "Socket left a match that finished, cleaning up..."
          )
          return server.removePlayerAndCleanup(table, player)
        }

        const notPlaying = !table.playing()

        if (player) {
          if (notPlaying) {
            table.playerDisconnected(player)

            table.log.trace(
              { player: player.getPublicPlayer(), matchSessionId: table.matchSessionId },
              "Socket left a match and it didn't start yet, checking..."
            )

            if (
              player.matchPlayerId &&
              server.store &&
              userSession.account &&
              table.lobby.options.satsPerPlayer > 0
            ) {
              try {
                const dbPlayer = await server.store.matchPlayer.findUnique({
                  where: { id: player.matchPlayerId },
                })
                if (!dbPlayer) {
                  await server.removePlayerAndCleanup(table, player)
                  return
                }
                await server.deletePlayerAndReturnBet(table, dbPlayer)
                return server.removePlayerAndCleanup(table, player)
              } catch (e) {
                table.log.error(e, "Failed to fetch or refund MatchPlayer record")
                await server.removePlayerAndCleanup(table, player)
                return
              }
            }

            userSession
              .waitReconnection(table.matchSessionId, PLAYER_LOBBY_TIMEOUT, "disconnection")
              .then(() => {
                log.trace(table.getPublicMatchInfo(), "User reconnected to lobby")
                table.playerReconnected(player, userSession)
              })
              .catch(() => {
                if (turn) {
                  turn.play.getHand().abandonPlayer(player)
                }
                return server.removePlayerAndCleanup(table, player)
              })
              .catch((e) => table.log.error(e, "Failed to remove player and cleanup"))
              .finally(() => server.emitMatchUpdate(table).catch(log.error))
            return
          }

          if (force) {
            table.log.trace(
              { player: player.getPublicPlayer(), matchSessionId: table.matchSessionId },
              "Socket left a match forcibly while playing, abandoning..."
            )

            if (turn) {
              await server.sayCommand(
                {
                  table,
                  command: ESayCommand.MAZO,
                  player,
                  play: turn.play,
                },
                true
              )
            }

            server.chat.rooms
              .getOrThrow(table.matchSessionId)
              .system(`${player.name} ha abandonado la partida`, "mate")

            turn?.play.getHand().abandonPlayer(player)
            table.playerDisconnected(player)
            turn?.resolve()
            server
              .emitMatchUpdate(table)
              .catch((e) =>
                log.error({ message: e.message }, "Failed to emit match update after a player left")
              )
          }
        }
      } catch (e) {
        table.log.error(e, "Failed to leave match!")
      }
    },
    async removePlayerAndCleanup(table, player) {
      try {
        table.log.trace({ player: player.getPublicPlayer() }, "Removing player from match")
        const lobby = await table.lobby.removePlayer(player.session as string)
        if (lobby.isEmpty()) {
          await server.cleanupMatchTable(table)
        }
      } catch (e) {
        table.log.error(e, "Error removing player and cleaning up")
      }
    },
    async getMatchDetails(socket, matchId) {
      if (!server.store) {
        throw new SocketError("NOT_FOUND", "Este server no soporta historial")
      }

      const match = await server.store.match.findFirstOrThrow({
        where: { id: matchId, state: EMatchState.FINISHED },
        include: {
          hands: {
            orderBy: {
              idx: "asc",
            },
          },
          players: {
            select: { accountId: true, name: true, teamIdx: true, idx: true, bot: true },
          },
        },
      })

      const isPlayer =
        match.players.findIndex((p) => p.accountId === socket.data.user?.account?.id) !== -1

      return isPlayer
        ? match
        : {
            ...match,
            options: { ...(match.options as unknown as ILobbyOptions), satsPerPlayer: 0 },
          }
    },
    async getAccountDetails(socket, accountId) {
      if (!server.store) {
        throw new SocketError("NOT_FOUND", "Este server no soporta historial")
      }

      if (!accountId) {
        throw new SocketError("UNEXPECTED_ERROR", "Missing account id")
      }

      const account = await accountsApi.users.getUser(String(accountId))

      const isPlayer = socket.data.user?.account?.id === accountId

      const matchPlayers = await server.store.matchPlayer.findMany({
        where: { accountId },
        include: {
          match: {
            include: {
              bet: {
                select: {
                  id: true,
                  satsPerPlayer: isPlayer,
                },
              },
              players: {
                select: {
                  idx: true,
                  teamIdx: true,
                  accountId: true,
                  bot: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: {
          id: "desc",
        },
      })

      const matches = matchPlayers
        .map((m) =>
          isPlayer
            ? m.match
            : { ...m.match, options: { ...(m.match.options as any), satsPerPlayer: undefined } }
        )
        .filter((m) => m.state === EMatchState.FINISHED)

      const stats = await server.store.userStats.findFirst({
        where: { accountId },
        select: {
          id: true,
          accountId: true,
          loss: true,
          win: true,
          satsBet: isPlayer,
          satsLost: isPlayer,
          satsWon: isPlayer,
        },
      })

      return {
        stats,
        matches,
        account: account.data,
      }
    },
    async getRanking() {
      if (!server.store) {
        throw new Error("Este server no soporta rankings")
      }

      const userstats = await server.store.$queryRaw<UserStats[]>`
        SELECT *, 
              CASE 
                WHEN ("win" + "loss") = 0 THEN 0.0
                ELSE "win"::float / ("win"::float + "loss"::float)
              END AS ratio,
              ("win" + "loss")::integer AS matches
        FROM "UserStats"
        WHERE ("win" + "loss")::integer >= 5
        ORDER BY ratio DESC, "win" DESC, "matches" DESC, "accountId" ASC
        LIMIT 20;
      `

      const ranking: Array<IPlayerRanking> = []

      for (const stats of userstats) {
        try {
          const account = await accountsApi.users.getUser(String(stats.accountId))

          if (account.data) {
            const rank = {
              accountId: stats.accountId,
              loss: stats.loss,
              name: account.data.name,
              win: stats.win,
              avatarUrl: account.data.avatarUrl,
            }
            logger.trace({ rank }, "Pushing player to ranking")
            ranking.push(rank)
          }
        } catch (e) {
          log.error({ stats }, "Failed to get ranking account details")
        }
      }

      server.ranking = ranking
      return ranking
    },
    async cleanupMatchTable(table) {
      const matchSessionId = table.matchSessionId
      table.log.trace(table.getPublicMatchInfo(), "Cleaning up match table")
      try {
        const shouldReturnBets = table.state() !== EMatchState.FINISHED
        if (server.store && shouldReturnBets) {
          await server.store.$transaction(
            async (tx) => {
              const dbMatch = await tx.match.findUnique({
                where: { id: table.matchId },
                include: { players: true, bet: true },
              })
              if (!dbMatch) {
                table.log.debug(
                  { matchId: table.matchId, sessionId: matchSessionId },
                  "Match not found during cleanup, skipping database operations"
                )
                return
              }

              table.log.debug(
                { matchId: table.matchId, playerCount: dbMatch.players.length },
                "Found match for cleanup"
              )

              // Process refunds for betting matches
              if (table.lobby.options.satsPerPlayer > 0) {
                for (const player of dbMatch.players) {
                  if (player.payRequestId && player.satsPaid > 0) {
                    table.log.trace(
                      {
                        playerId: player.id,
                        accountId: player.accountId,
                        payRequestId: player.payRequestId,
                      },
                      "Processing refund for player"
                    )
                    await server.deletePlayerAndReturnBet(table, player)
                  } else {
                    table.log.trace(
                      { playerId: player.id, accountId: player.accountId },
                      "No refund needed for player (no payRequestId or satsPaid)"
                    )
                    await tx.matchPlayer.delete({
                      where: { id: player.id },
                    })
                  }
                }

                if (dbMatch.bet) {
                  await tx.matchBet.delete({ where: { matchId: table.matchId } })
                  table.log.info(
                    { matchId: table.matchId, betId: dbMatch.bet.id },
                    "Deleted matchBet record"
                  )
                }
              } else {
                // Delete players for non-betting matches
                await tx.matchPlayer.deleteMany({ where: { matchId: table.matchId } })
                table.log.trace(
                  { matchId: table.matchId },
                  "Deleted matchPlayer records for non-betting match"
                )
              }

              // Delete the match record for non-finished matches
              await tx.match.delete({ where: { id: table.matchId } })
              table.log.info({ matchId: table.matchId }, "Deleted match record")
            },
            { timeout: 60000 }
          )
        } else if (server.store) {
          // Handle finished matches: preserve database record, clean up server state
          table.log.info(
            { matchId: table.matchId, sessionId: matchSessionId },
            "Match is finished, preserving database record"
          )
        }

        if (table.lobby.playAgainRequest) {
          const newTable = server.tables.get(table.lobby.playAgainRequest.newMatchSessionId)
          if (newTable && !newTable.playing()) {
            await new Promise<void>((resolve) =>
              setTimeout(resolve, MATCH_FINISHED_CLEANUP_TIMEOUT)
            )

            return server.cleanupMatchTable(table)
          }
        }

        server.chat.rooms.get(table.matchSessionId)?.system("Chat finalizado.", "leave")

        // Notify all sockets of match deletion
        await server.getTableSockets(table, async (socket) => {
          socket.emit(EServerEvent.MATCH_DELETED, matchSessionId)
        })

        // Disconnect all sockets from the match
        await server.getTableSockets(table, async (playerSocket, player) => {
          playerSocket.leave(table.matchSessionId)
          if (player) {
            playerSocket.leave(table.matchSessionId + player.teamIdx)
          }
        })

        // Clean up player sessions
        for (const player of table.lobby.players) {
          const userSession = server.sessions.get(player.session)
          if (!userSession) {
            continue
          }
          userSession.resolveWaitingPromises(matchSessionId)
          if (player.bot) {
            server.sessions.delete(player.session)
            continue
          }
          if (player.isOwner) {
            userSession.ownedMatches.delete(matchSessionId)
          }
        }

        // Remove match-related data from server state
        server.tables.delete(matchSessionId)
        server.chat.delete(matchSessionId)
        server.turns.delete(matchSessionId)

        server.io.to("searching").emit(EServerEvent.UPDATE_PUBLIC_MATCHES, server.tables.getAll())

        table.log.trace({ matchSessionId }, "Deleted Match Table")
      } catch (e) {
        table.log.error(e, "Error cleaning up MatchTable")
      }
    },
  }

  const _getPossiblePlayingMatch = (
    matchSessionId: string,
    session: string
  ): { table: IMatchTable; player?: IPlayer; user?: IUserData } | null => {
    const table = server.tables.get(matchSessionId)
    if (table) {
      table.log.trace(
        { session, matchSessionId, table },
        "Trying to get match room to check if session is in it"
      )
      const player = table.isSessionPlaying(session)
      if (player) {
        return { table, player, user: server.sessions.getOrThrow(session).getUserData() }
      }
      return { table }
    }
    return null
  }

  io.of("/").adapter.on("leave-room", (room, socketId) => {
    log.trace({ room, socketId }, "Player socket left match room")
  })

  io.of("/").adapter.on("join-room", (room, socketId) => {
    const playingMatch = _getPossiblePlayingMatch(room, socketId)
    if (!playingMatch || !playingMatch.user) {
      return
    }
    const { table, user } = playingMatch

    const userSession = server.sessions.getOrThrow(user.session)

    table.log.trace({ matchId: room, socketId }, "Player socket joined match room")

    userSession.reconnect(table.matchSessionId, "disconnection")
  })

  return server
}
