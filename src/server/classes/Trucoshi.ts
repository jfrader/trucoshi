import { randomUUID } from "crypto"
import debounce from "lodash.debounce"
import { createServer, Server as HttpServer } from "http"
import { Server, Socket } from "socket.io"
import {
  EAnswerCommand,
  ECommand,
  EFlorCommand,
  EHandState,
  ESayCommand,
  GAME_ERROR,
  ICard,
  ILobbyOptions,
  IMatchDetails,
  IPlayer,
  IPlayerRanking,
  IPublicMatch,
  IPublicMatchInfo,
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
import { EMatchState, Match, MatchPlayer, Prisma, PrismaClient, UserStats } from "@prisma/client"
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
import { getCommandSound } from "../sounds"

const log = logger.child({ class: "Trucoshi" })

interface ITrucoshiTurn {
  play: IPlayInstance
  timeout: NodeJS.Timeout | null
  resolve(): void
}

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
  turns: TMap<string, ITrucoshiTurn> // sessionId, play instance
  stats: ITrucoshiStats
  emitStats(): void
  createUserSession(socket: TrucoshiSocket, username?: string, token?: string): IUserSession
  getTableSockets(
    table: IMatchTable,
    callback?: (playerSocket: TrucoshiSocket, player: IPlayer | null) => Promise<void>
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
  emitMatchUpdate(table: IMatchTable, skipSocketIds?: Array<string>): Promise<IPublicMatch>
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
  createMatchTable(matchSessionId: string, userSession: IUserSession): Promise<IMatchTable>
  setMatchOptions(input: {
    identityJwt: string | null
    matchSessionId: string
    userSession: IUserSession
    options: Partial<ILobbyOptions>
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
    identityJwt: string | null,
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
  setTurnTimeout(params: {
    table: IMatchTable
    player: IPlayer
    user: IUserSession
    play: IPlayInstance
    retry: () => void
    cancel: () => void
  }): NodeJS.Timeout
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
  getAccountDetails(
    socket: TrucoshiSocket,
    accountId: number
  ): Promise<{ stats: UserStats | null; matches: Array<Match>; account: User }>
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

  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      pingInterval: 10000, // Send ping every 10s
      pingTimeout: 5000, // Disconnect if no pong in 5s
      cors: {
        credentials: true,
        origin,
        methods: ["GET", "POST"],
      },
    }
  )

  const sessions = new TMap<string, IUserSession>() // sessionId (token), user
  const tables = new MatchTableMap() // sessionId, table
  const turns = new TMap<string, ITrucoshiTurn>() // sessionId, play instance, play promise resolve and type

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
          await accountsApi.auth.getAuth()
          logger.info("Logged in to lightning-accounts")
        } catch (e) {
          logger.error(e, "Failed to login to lightning-accounts")
        }
      }

      if (redis) {
        logger.debug("Connecting to redis at " + process.env.APP_REDIS_URL)
        try {
          await Promise.all([pubClient.connect(), subClient.connect()])
          io.adapter(createAdapter(pubClient, subClient))
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
              bet: { satsPerPlayer: { gt: 0 }, winnerAwarded: false },
            },
            include: { bet: true, players: true },
          })

          if (unpaidMatches.length > 0) {
            logger.error(
              { unpaidMatchesLength: unpaidMatches.length },
              "Found matches that had outstanding bets, trying to repay players entrance sats..."
            )
          }

          for (const match of unpaidMatches) {
            const matchLog = log.child({ matchSessionId: match.sessionId, matchId: match.id })

            matchLog.trace("Trying to repay bets to players on this match...")
            // Returning bets to all players if wasnt awarded and server is starting
            // Should also check if one of the teams won and give the award to its players
            for (const player of match.players) {
              if (
                player.accountId &&
                player.satsPaid > 0 &&
                player.satsReceived < player.satsPaid
              ) {
                const amountInSats = player.satsPaid - player.satsReceived

                if (!amountInSats) {
                  matchLog.trace(
                    {
                      playerAccountId: player.accountId,
                      satsPaid: player.satsPaid,
                      satsReceived: player.satsReceived,
                      amountInSats,
                    },
                    "Nothing to pay to this player"
                  )
                  continue
                }

                matchLog.trace(
                  {
                    playerAccountId: player.accountId,
                    amountInSats,
                  },
                  "Looking for paid pay request"
                )

                const pr = await accountsApi.wallet.payRequestDetail(String(player.payRequestId))

                matchLog.trace(
                  {
                    isPaid: pr.data.paid,
                    payRequestId: pr.data.id,
                  },
                  "Found Pay Request..."
                )

                if (pr.data.paid) {
                  matchLog.trace(
                    {
                      isPaid: pr.data.paid,
                      payRequestId: pr.data.id,
                    },
                    "It's paid, so paying user now..."
                  )

                  server.store.$transaction(async (tx) => {
                    await tx.matchPlayer.update({
                      where: { id: player.id },
                      data: { satsReceived: amountInSats },
                    })

                    await accountsApi.wallet.payUser({
                      amountInSats,
                      userId: player.accountId!,
                      description: `Returning bet from unfinished match ID: ${match.id}`,
                    })
                  })
                }
              }
            }

            await server.store.matchBet.update({
              where: { id: match.bet?.id },
              data: { winnerAwarded: true },
            })
          }
        } catch (e) {
          logger.error(e, "Failed to repay unpaid matches")
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

      const res = await accountsApi.users.usersDetail(String(payload.sub))

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
            userSession.reconnect(matchSessionId, "disconnection")
            socket.join(matchSessionId)
            socket.join(matchSessionId + player.teamIdx)

            if (table.state() === EMatchState.STARTED) {
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
      const allSockets = await server.io.sockets.adapter.fetchSockets({
        rooms: new Set([table.matchSessionId]),
      })

      const players: IPublicPlayer[] = []
      const playerSockets: any[] = []
      const spectatorSockets: any[] = []

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
    async emitMatchUpdate(table, skipSocketIds = []) {
      log.trace(table.getPublicMatchInfo(), "Emitting match update to all sockets")
      const publicMatch = table.getPublicMatch()
      await server.getTableSockets(table, async (playerSocket, player) => {
        if (skipSocketIds.includes(playerSocket.id) || !playerSocket.data.user) {
          return
        }
        playerSocket.emit(
          EServerEvent.UPDATE_MATCH,
          player ? table.getPublicMatch(playerSocket.data.user.session) : publicMatch
        )
      })
      return publicMatch
    },
    async emitWaitingPossibleSay({ play, table, onlyThisSocket }) {
      log.trace(
        { match: table.getPublicMatchInfo(), handIdx: play.handIdx },
        "Emitting match possible players say"
      )
      return new Promise<void>((resolve, reject) => {
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

            log.trace(
              { match: table.getPublicMatchInfo(), player: player.getPublicPlayer() },
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
                if (!data) {
                  return
                }
                if (!play.waitingPlay) {
                  log.trace(
                    { match: table.getPublicMatchInfo(), player: player.getPublicPlayer() },
                    "Tried to say something but someone said something already"
                  )
                  return reject(
                    new Error(
                      EServerEvent.WAITING_POSSIBLE_SAY +
                        " was not expecting this player to say anything"
                    )
                  )
                }
                const { command } = data
                server
                  .sayCommand({ table, play, player, command })
                  .then(() => {
                    resolve()
                    server.sessions.getOrThrow(player.session).reconnect(table.matchSessionId)
                  })
                  .catch(reject)
              }
            )
          })
          .catch((e) => log.error({ message: e.message }, "emitWaitingPossibleSay error"))
      })
    },
    async emitWaitingForPlay({ play, table, onlyThisSocket }) {
      return new Promise<"say" | "play">((resolve, reject) => {
        server
          .emitWaitingPossibleSay({ play, table, onlyThisSocket })
          .then(() => resolve("say"))
          .catch((e) => log.error(e, "Error on emitWaitingForPlay, rejected waitingPossibleSay"))
        return server
          .getTableSockets(table, async (playerSocket, player) => {
            if (onlyThisSocket && playerSocket.id !== onlyThisSocket) {
              return
            }

            if (!player) {
              return
            }

            if (!playerSocket.data.matches) {
              log.error({ player: player.name }, "Player socket doesn't have data.matches!")
              return
            }

            if (playerSocket.data.matches.get(table.matchSessionId)?.isWaitingForPlay) {
              return
            }

            if (player.session === play.player?.session) {
              log.trace(
                {
                  match: table.getPublicMatchInfo(),
                  player: player.getPublicPlayer(),
                  handIdx: play.handIdx,
                  rounds: play.getHand().rounds,
                },
                "Emitting waiting play to a player"
              )
              playerSocket.emit(
                EServerEvent.WAITING_PLAY,
                table.getPublicMatch(player.session),
                (data: IWaitingPlayData) => {
                  if (!data) {
                    return reject(new Error(EServerEvent.WAITING_PLAY + " callback returned empty"))
                  }
                  if (!play.waitingPlay) {
                    log.trace(
                      { match: table.getPublicMatchInfo(), player: player.getPublicPlayer() },
                      "Tried to play a card but play is not waiting a play"
                    )
                    return reject(
                      new Error(
                        EServerEvent.WAITING_PLAY + " was not expecting this player to play"
                      )
                    )
                  }
                  const { cardIdx, card } = data
                  server
                    .playCard({ table, play, player, cardIdx, card })
                    .then(() => {
                      resolve("play")
                      server.sessions.getOrThrow(player.session).reconnect(table.matchSessionId)
                    })
                    .catch(reject)
                }
              )
            }
          })
          .catch((e) => log.error({ message: e.message }, "emitWaitingForPlay error"))
      })
    },
    sayCommand({ table, play, player, command }, force) {
      const matchTable = typeof table === "string" ? server.tables.getOrThrow(table) : table
      return new Promise<void>((resolve, reject) => {
        if (command || command === 0) {
          log.trace({ player, command }, "Attempt to say command")

          const hand = play.getHand()
          const currentState = hand.state

          const saidCommand = play.say(command, player, force)

          if (saidCommand || saidCommand === 0) {
            log.trace({ player, command }, "Say command success")

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
          return reject(new Error("Invalid Command " + command))
        }
        return reject(new Error("Undefined Command"))
      })
    },
    playCard({ table, play, player, cardIdx, card }) {
      const matchTable = typeof table === "string" ? server.tables.getOrThrow(table) : table
      return new Promise<void>((resolve, reject) => {
        if (cardIdx !== undefined && card) {
          log.trace({ player, card, cardIdx }, "Attempt to play card")
          const playedCard = play.use(cardIdx, card)
          if (playedCard) {
            log.trace({ player, card, cardIdx }, "Play card success")
            server.clearTurnTimeout(matchTable.matchSessionId)

            const sound =
              card === "1e" && (play.roundIdx === 3 || play.rounds?.[play.roundIdx - 2]?.tie)
                ? "espada"
                : "play"

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
          return log.error({ player: player?.name }, "Player socket doesn't have data.matches!!!")
        }
        playerSocket.data.matches.set(table.matchSessionId, {
          isWaitingForPlay: false,
          isWaitingForSay: false,
        })
      })
    },
    async emitFlorBattle(hand, table) {
      log.trace(table.getPublicMatchInfo(), "Emitting flor battle to players")

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
          }).catch(() => log.error(player, "Resolved flor battle emit"))
        )
      })

      if (hand.flor.winner) {
        chat.system(`La flor se la lleva ${hand.flor.winner.name}`)
      }

      log.trace(table.getPublicMatchInfo(), "Awaiting all flor battle promises")

      await Promise.allSettled(promises)

      log.trace(
        table.getPublicMatchInfo(),
        "Flor battle timeout has finished, all players settled for next hand"
      )
    },
    async onBotTurn(table, play) {
      return new Promise(async (resolve, reject) => {
        server.turns.set(table.matchSessionId, {
          play,
          resolve,
          timeout: null,
        })

        server
          .emitWaitingPossibleSay({ play, table })
          .then(() => resolve())
          .catch((e) => log.error(e, "Error onBotTurn, rejected waitingPossibleSay"))

        await new Promise((res) =>
          setTimeout(
            res,
            Math.max(
              PLAYER_TIMEOUT_GRACE,
              PLAYER_TIMEOUT_GRACE * Math.random() * 4,
              play.handIdx === 1 && play.roundIdx === 1 ? PLAYER_TIMEOUT_GRACE * 6 : 0
            )
          )
        )

        const player = play.player
        if (!player || !player.bot || !table.lobby.table) {
          return reject()
        }
        return player
          .playBot(table.lobby.table, play, server.playCard, server.sayCommand)
          .then(resolve)
          .catch(reject)
      })
    },
    clearTurnTimeout(matchSessionId) {
      const turn = server.turns.getOrThrow(matchSessionId)
      if (turn.timeout) {
        clearTimeout(turn.timeout)
      }
    },
    setTurnTimeout({ table, player, play, user, retry, cancel }) {
      log.trace({ player, options: table.lobby.options }, "Setting turn timeout")

      const chat = server.chat.rooms.getOrThrow(table.matchSessionId)

      return setTimeout(() => {
        log.trace(
          { match: table.getPublicMatchInfo(), player: player.getPublicPlayer() },
          "Turn timed out, disconnecting"
        )

        table.playerDisconnected(player)

        const startTime = Date.now()

        user
          .waitReconnection(
            table.matchSessionId,
            table.lobby.options.abandonTime - player.abandonedTime,
            "turn"
          )
          .then(() => {
            const reconnectTime = Date.now()
            player.addDisconnectedTime(reconnectTime - startTime)

            log.trace(
              { match: table.getPublicMatchInfo(), player: player.getPublicPlayer() },
              "Player reconnected"
            )
            table.playerReconnected(player, user)
            retry()
          })
          .catch(() => {
            log.trace(
              { match: table.getPublicMatchInfo(), player: player.getPublicPlayer() },
              "Player abandoned"
            )

            play.getHand().abandonPlayer(player)

            chat.system(`${player.name} se retiro de la partida.`, "leave")
            cancel()
          })
          .finally(() => server.emitMatchUpdate(table).catch(log.error))
      }, table.lobby.options.turnTime + PLAYER_TIMEOUT_GRACE)
    },
    onTurn(table, play) {
      log.trace(
        { match: table.getPublicMatchInfo(), player: play.player, handIdx: play.handIdx },
        "Turn started"
      )
      return new Promise<void>((resolve) => {
        const session = play.player?.session
        if (!session || !play || !play.player) {
          throw new Error("No session, play instance or player found")
        }

        const player = play.player
        const user = server.sessions.getOrThrow(session)

        player.setTurnExpiration(table.lobby.options.turnTime, table.lobby.options.abandonTime)

        const turn = () =>
          server
            .emitWaitingForPlay({ play, table })
            .then(() => {
              resolve()
            })
            .catch((e) => {
              log.error(e, "ONTURN CALLBACK ERROR")
              turn()
            })

        turn()

        const timeout = server.setTurnTimeout({
          table,
          player,
          play,
          user,
          retry: turn,
          cancel: () =>
            server
              .sayCommand({ table, play, player, command: ESayCommand.MAZO }, true)
              .catch((e) => log.error(e, "Turn timeout retry say command MAZO failed"))
              .finally(resolve),
        })

        server.turns.set(table.matchSessionId, {
          play,
          resolve,
          timeout,
        })
      })
    },
    onTruco(table, play) {
      log.trace(
        { match: table.getPublicMatchInfo(), player: play.player, handIdx: play.handIdx },
        "Truco answer turn started"
      )
      return new Promise<void>((resolve) => {
        const session = play.player?.session
        if (!session || !play || !play.player) {
          throw new Error("No session, play instance or player found")
        }

        play.player.setTurnExpiration(table.lobby.options.turnTime, table.lobby.options.abandonTime)

        const turn = () =>
          server
            .emitWaitingPossibleSay({ play, table })
            .then(() => resolve())
            .catch((e) => {
              log.error(e, "ONTRUCO CALLBACK ERROR")
              turn()
            })

        turn()

        const player = play.player
        const user = server.sessions.getOrThrow(session)

        const timeout = server.setTurnTimeout({
          table,
          player,
          play,
          user,
          retry: turn,
          cancel: () =>
            server
              .sayCommand({ table, play, player, command: EAnswerCommand.NO_QUIERO }, true)
              .catch((e) => log.error(e, "Truco turn timeout retry say command NO_QUIERO failed"))
              .finally(resolve),
        })

        server.turns.set(table.matchSessionId, {
          play,
          resolve,
          timeout,
        })
      })
    },
    onFlor(table, play) {
      log.trace(
        {
          match: table.getPublicMatchInfo(),
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

        play.player.setTurnExpiration(table.lobby.options.turnTime, table.lobby.options.abandonTime)

        const turn = () =>
          server
            .emitWaitingPossibleSay({ play, table })
            .then(() => resolve())
            .catch((e) => {
              log.error(e, "ONFLOR CALLBACK ERROR")
              turn()
            })

        turn()

        const player = play.player
        const user = server.sessions.getOrThrow(session)

        const timeout = server.setTurnTimeout({
          table,
          player,
          play,
          user,
          retry: turn,
          cancel: () => {
            server
              .sayCommand({ table, play, player, command: EFlorCommand.FLOR }, true)
              .catch((e) => log.error(e, "Flor turn timeout failed to say FLOR command"))
              .finally(resolve)
          },
        })

        server.turns.set(table.matchSessionId, {
          play,
          resolve,
          timeout,
        })
      })
    },
    async onFlorBattle(table, play, hand) {
      log.trace(
        {
          match: table.getPublicMatchInfo(),
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
        log.error(
          { matchId: table.matchSessionId },
          "Flor battle has null hand object, resolving..."
        )
        return Promise.resolve()
      }

      return server.emitFlorBattle(hand, table)
    },
    onEnvido(table, play, isPointsRound) {
      log.trace(
        {
          match: table.getPublicMatchInfo(),
          player: play.player,
          handIdx: play.handIdx,
          isPointsRound,
        },
        "Envido answer turn started"
      )
      return new Promise<void>((resolve, reject) => {
        const session = play.player?.session as string
        if (!session || !play || !play.player) {
          throw new Error("No session, play instance or player found")
        }

        play.player.setTurnExpiration(table.lobby.options.turnTime, table.lobby.options.abandonTime)

        const turn = () =>
          server
            .emitWaitingPossibleSay({ play, table })
            .then(() => resolve())
            .catch((e) => {
              log.error(e, "ONENVIDO CALLBACK ERROR")
              turn()
            })

        turn()

        const player = play.player
        const user = server.sessions.getOrThrow(session)

        const timeout = server.setTurnTimeout({
          table,
          player,
          play,
          user,
          retry: turn,
          cancel: () => {
            if (isPointsRound) {
              return server
                .sayCommand({ table, play, player, command: 0 }, true)
                .catch((e) => log.error(e, "Envido turn timeout failed to say '0' points command"))
                .finally(resolve)
            }
            server
              .sayCommand({ table, play, player, command: EAnswerCommand.NO_QUIERO }, true)
              .catch((e) => log.error(e, "Envido turn timeout failed to say NO_QUIERO command"))
              .finally(resolve)
          },
        })

        server.turns.set(table.matchSessionId, {
          play,
          resolve,
          timeout,
        })
      })
    },
    async onHandFinished(table) {
      log.trace({ ...table.getPublicMatchInfo() }, `Table Hand Finished`)

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

      log.trace(
        table.getPublicMatchInfo(),
        "Previous hand timeout has finished, all players settled for next hand"
      )
    },
    onWinner(table, winner) {
      const matchEndTime = Date.now()
      return new Promise<void>((resolve) => {
        log.trace(table.getPublicMatchInfo(), "Match has finished with a winner")

        const chat = server.chat.rooms.getOrThrow(table.matchSessionId)
        chat.system(`${winner.name} es el equipo ganador!`)

        const winnerIdx = winner.id.toString() as "0" | "1"
        const loserIdx = Number(!winner.id).toString() as "0" | "1"

        chat.sound("winner", winnerIdx)
        chat.sound("deal", loserIdx)
        chat.sound("ceba_toma_mate", loserIdx)

        server
          .emitMatchUpdate(table)
          .then(() =>
            server.getTableSockets(table, async (playerSocket, player) => {
              if (player) {
                const activeMatches = server.getSessionActiveMatches(player.session)
                log.trace({ activeMatches }, "Match finished, updating active matches")
                playerSocket.emit(EServerEvent.UPDATE_ACTIVE_MATCHES, activeMatches)
              }
            })
          )
          .catch((e) => {
            log.error(e, "ONWINNER CALLBACK ERROR")
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

          chat.system("Chat finalizado.", "leave")

          setTimeout(() => {
            server.cleanupMatchTable(table)
            resolve()
          }, 3 * 1000)
        }

        setTimeout(cleanup, MATCH_FINISHED_CLEANUP_TIMEOUT)
      })
    },
    async createMatchTable(matchSessionId, userSession) {
      const table = MatchTable(matchSessionId, userSession)

      log.trace(userSession.getPublicInfo(), "User has created a new match table", table)

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
      const wallet = await accountsApi.users.walletDetail(String(payload.sub))

      if (wallet.data.balanceInSats < satsPerPlayer) {
        throw new Error(GAME_ERROR.INSUFFICIENT_BALANCE)
      }

      return true
    },
    async setMatchOptions({ identityJwt, matchSessionId, userSession, options }) {
      if (!userSession.ownedMatches.has(matchSessionId)) {
        throw new Error("User is not the match owner, can't set options")
      }

      const table = server.tables.getOrThrow(matchSessionId)
      if (table.lobby.started || table.busy) {
        throw new Error("Match already started or already had bets setup, can't change options")
      }

      let payRequests: PayRequest[] = []
      const satsPerPlayer = options.satsPerPlayer
      const currentOptions = structuredClone(table.lobby.options)

      const hasChangedBet =
        satsPerPlayer !== undefined && currentOptions.satsPerPlayer !== satsPerPlayer

      if (hasChangedBet) {
        if (satsPerPlayer > 0) {
          if (
            process.env.APP_MAX_BET &&
            Number(process.env.APP_MAX_BET) > 0 &&
            satsPerPlayer > Number(process.env.APP_MAX_BET)
          ) {
            throw new SocketError("FORBIDDEN", "Maximo " + process.env.APP_MAX_BET + " sats")
          }

          if (!server.store) {
            throw new Error("This server doesn't support bets")
          }

          if (!identityJwt) {
            log.error({ identityJwt, acc: userSession.account }, "Failed to save options")
            throw new SocketError("INVALID_IDENTITY", "Inicia sesion para usar sats!")
          }

          if (!userSession.account) {
            log.error({ identityJwt, acc: userSession.account }, "Failed to save options")
            throw new SocketError("FORBIDDEN", "Inicia sesion para usar sats!")
          }

          await server.checkUserSufficientBalance({
            identityJwt,
            account: userSession.account,
            satsPerPlayer,
          })

          const guestSessions = table.lobby.players
            .filter((player) => !player.accountId)
            .map((u) => u.session)

          for (const session of guestSessions) {
            await table.lobby.removePlayer(session)
          }

          await server.getTableSockets(table, async (playerSocket) => {
            if (playerSocket.data.user && guestSessions.includes(playerSocket.data.user?.session)) {
              playerSocket.emit(
                EServerEvent.KICK_PLAYER,
                table.getPublicMatch(playerSocket.data.user.session),
                playerSocket.data.user.session,
                GAME_ERROR.GAME_REQUIRES_ACCOUNT
              )
            }
          })

          await server.store.$transaction(async (tx) => {
            await tx.match.update({
              data: {
                options: table.lobby.options as unknown as Prisma.JsonObject,
                bet:
                  satsPerPlayer > 0
                    ? {
                        upsert: {
                          create: {
                            allPlayersPaid: false,
                            winnerAwarded: false,
                            satsPerPlayer,
                          },
                          update: {
                            allPlayersPaid: false,
                            winnerAwarded: false,
                            satsPerPlayer,
                          },
                        },
                      }
                    : undefined,
              },
              where: {
                id: table.matchId,
              },
              include: {
                bet: true,
              },
            })

            table.lobby.setOptions(options)

            try {
              const prs = await accountsApi.wallet.payRequestsCreate({
                amountInSats: satsPerPlayer,
                description: `Request to enter match ${matchSessionId} - Match ID: ${table.matchId}`,
                meta: {
                  application: "trucoshi",
                  matchSessionId,
                  matchId: table.matchId,
                },
                receiverIds: table.lobby.players
                  .filter((p) => !!p.accountId)
                  .map((p) => p.accountId) as number[],
              })
              payRequests = prs.data
            } catch (e) {
              table.lobby.setOptions(currentOptions)
              throw e
            }
          })
        } else {
          // @TODO: Cleanup databases from bet and payback old bet if removing sats or changing amount
          // (not actually possible yet due to lobby.busy flag)
        }
      } else {
        table.lobby.setOptions(options)
      }

      server.chat.rooms
        .getOrThrow(table.matchSessionId)
        .system("Las reglas han cambiado", hasChangedBet ? "bot" : "chat")

      table.lobby.players.forEach((player) => {
        if (player.bot) {
          return
        }
        player.setPayRequest(payRequests.find((pr) => pr.receiver?.id === player.accountId)?.id)
        player.setReady(false)
      })

      return table
    },
    async kickPlayer({ matchSessionId, userSession, key }) {
      const table = server.tables.getOrThrow(matchSessionId)
      const player = table.isSessionPlaying(userSession.session)

      if (
        !player ||
        table.state() === EMatchState.STARTED ||
        table.state() === EMatchState.FINISHED
      ) {
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
        .catch((e) => log.error({ message: e.message }, "Emit update after kick player failed"))

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

      if (server.store) {
        if (ready && table.lobby.options.satsPerPlayer > 0) {
          if (!player.payRequestId) {
            throw new Error("Player doesn't have a pay request ID!")
          }

          if (!userSession.account) {
            throw new SocketError(
              "GAME_REQUIRES_ACCOUNT",
              "Necesitas iniciar sesion para usar sats"
            )
          }

          const res = await accountsApi.wallet.payRequestDetail(String(player.payRequestId))
          pr = res.data

          log.debug({ pr }, "Found PR for setting player ready")

          if (!pr) {
            throw new Error("Pay request not found!")
          }

          if (!pr.paid) {
            throw new Error("Pay request has not been paid!")
          }

          table.setBusy(true)
        }

        const where = { matchId: table.matchId }
        const dbPlayerExists = await server.store.matchPlayer.findFirst({
          where: userSession.account
            ? { accountId: userSession.account.id, ...where }
            : { session: userSession.session, ...where },
        })

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

        log.trace({ update }, "About to update or create match player")

        if (dbPlayerExists) {
          const dbPlayer = await server.store.matchPlayer.update({
            where: { id: dbPlayerExists.id },
            data: update,
          })
          player.setMatchPlayerId(dbPlayer.id)
          log.trace({ dbPlayer }, "Updated match player")
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
          log.trace({ dbPlayer }, "Created match player")
        }
      }

      player.setReady(ready)

      if (player.bot) {
        server.chat.rooms
          .get(table.matchSessionId)
          ?.system(`${player.name} ${ready ? "está" : "no está"} listo`, ready ? "botvoice" : "bot")
      } else {
        server.chat.rooms
          .get(table.matchSessionId)
          ?.system(`${player.name} ${ready ? "está" : "no está"} listo`, ready ? "join" : "leave")
      }

      server
        .emitMatchUpdate(table)
        .catch((e) =>
          log.error({ message: e.message }, "Failed to emit match update after player set ready")
        )

      return table
    },
    async joinMatch(table, userSession, identityJwt, teamIdx) {
      let prId: number | undefined
      let matchPlayerId: number | undefined
      if (table.lobby.options.satsPerPlayer > 0) {
        if (!userSession.account?.id || !identityJwt) {
          throw new Error("Player needs to be logged into an account to join this match")
        }

        const currentPlayer = table.isSessionPlaying(userSession.session)

        await server.checkUserSufficientBalance({
          identityJwt,
          account: userSession.account,
          satsPerPlayer: table.lobby.options.satsPerPlayer,
        })

        if (currentPlayer) {
          matchPlayerId = currentPlayer.matchPlayerId
          prId = currentPlayer.payRequestId
        } else {
          const res = await accountsApi.wallet.payRequestCreate({
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

        const prs = await accountsApi.wallet.payRequestsList({
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

      log.info(table.getPublicMatchInfo(), "Match started")

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

                log.debug(
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

                table.setAwardedPerPlayer(amountInSats)
              } catch (e) {
                log.fatal(e, "ON WINNER: Failed to pay awards!")
              }
              try {
                await server.store.matchBet.update({
                  where: { matchId: table.matchId },
                  data: { winnerAwarded: true },
                })
              } catch (e) {
                log.fatal(e, "ON WINNER: Failed to update bet after paying awards!")
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
        .then(() => log.info(table.getPublicMatchInfo(), "Match finished"))
        .catch((e) => log.error(e, "Lobby match loop failed"))

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
        .catch(log.error)

      server.io.to("searching").emit(EServerEvent.UPDATE_PUBLIC_MATCHES, server.tables.getAll())
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
          return
        }

        if (!player.accountId) {
          return
        }

        log.trace(
          { player, matchSessionId: table.matchSessionId },
          "Socket left a match lobby that had bets paid by the player, giving sats back if needed..."
        )

        if (player && player.accountId && player.satsPaid > 0) {
          const amountInSats = player.satsPaid - player.satsReceived

          if (!amountInSats) {
            log.trace(
              {
                matchId: table.matchId,
                sessionId: table.matchSessionId,
                playerAccountId: player.accountId,
                satsPaid: player.satsPaid,
                satsReceived: player.satsReceived,
                amountInSats,
              },
              "Nothing to pay to this player"
            )
            return
          }
          const pr = await accountsApi.wallet.payRequestDetail(String(player.payRequestId))

          log.trace(
            { pr: pr.data, player },
            "Found pay request, checking if paid to return sats..."
          )

          if (pr.data.paid) {
            await server.store.$transaction(async (tx) => {
              await tx.matchPlayer.delete({
                where: { id: player.id },
              })

              await accountsApi.wallet.payUser({
                amountInSats: pr.data.amountInSats,
                userId: player.accountId!,
                description: `Returning bet from leaving match ID: ${table.matchId}`,
              })

              log.debug(
                {
                  matchId: table.matchId,
                  sessionId: table.matchSessionId,
                  playerAccountId: player.accountId,
                  satsPaid: player.satsPaid,
                  satsReceived: player.satsReceived,
                  amountInSats,
                },
                "Sent sats from bet back to player"
              )
            })
          } else {
            throw new Error("Pay request wasn't marked as paid")
          }
        }
      } catch (e) {
        log.fatal(e, "Failed to return bet sats to player!")
      }
    },
    async leaveMatch(matchId, socket, force = false) {
      try {
        const userSession = server.sessions.getOrThrow(socket.data.user?.session)

        log.trace({ matchId, socket: socket.id }, "Socket trying to leave a match")

        const table = server.tables.getOrThrow(matchId)
        const player = table.isSessionPlaying(userSession.session)
        const turn = server.turns.get(table.matchSessionId)

        if (!player) {
          log.trace({ matchId, socket: socket.id }, "Socket left a match but isn't in it")
          return
        }

        if (table.state() === EMatchState.FINISHED) {
          log.trace(
            { matchId, socket: socket.id },
            "Socket left a match that finished, cleaning up..."
          )
          return server.removePlayerAndCleanup(table, player)
        }

        const notStarted = table.state() !== EMatchState.STARTED

        if (player) {
          if (notStarted) {
            table.playerDisconnected(player)

            log.trace(
              { player: player.getPublicPlayer(), matchSessionId: table.matchSessionId },
              "Socket left a match and it didn't start yet, checking..."
            )

            if (
              player.matchPlayerId &&
              server.store &&
              userSession.account &&
              table.lobby.options.satsPerPlayer > 0
            ) {
              const dbPlayer = await server.store.matchPlayer.findUniqueOrThrow({
                where: { id: player.matchPlayerId },
              })
              await server.deletePlayerAndReturnBet(table, dbPlayer)
              return server.removePlayerAndCleanup(table, player)
            }

            userSession
              .waitReconnection(table.matchSessionId, PLAYER_LOBBY_TIMEOUT, "disconnection")
              .then(() => {
                log.trace({ ...table.getPublicMatchInfo() }, "User reconnected to lobby")
                table.playerReconnected(player, userSession)
              })
              .catch(() => {
                if (turn) {
                  turn.play.getHand().abandonPlayer(player)
                }
                return server.removePlayerAndCleanup(table, player)
              })
              .catch((e) => log.error(e, "Failed to remove player and cleanup"))
              .finally(() => server.emitMatchUpdate(table).catch(log.error))
            return
          }

          if (force) {
            log.trace(
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
        log.error(e, "Failed to leave match!")
      }
    },
    async removePlayerAndCleanup(table, player) {
      try {
        log.trace(
          { table: table.getPublicMatchInfo(), player: player.getPublicPlayer() },
          "Removing player from match"
        )
        const lobby = await table.lobby.removePlayer(player.session as string)
        if (lobby.isEmpty()) {
          await server.cleanupMatchTable(table)
        }
      } catch (e) {
        log.error(e, "Error removing player and cleaning up")
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

      const account = await accountsApi.users.usersDetail(String(accountId))

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
            },
          },
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
          const account = await accountsApi.users.usersDetail(String(stats.accountId))

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
      log.trace({ table: table.getPublicMatchInfo() }, "Cleaning up match table")
      try {
        const shouldReturnBets = table.state() !== EMatchState.FINISHED
        if (server.store && shouldReturnBets && table.lobby.options.satsPerPlayer > 0) {
          await server.store.$transaction(async (tx) => {
            const dbMatch = await tx.match.findUniqueOrThrow({
              where: { id: table.matchId },
              include: { players: true },
            })

            for (const player of dbMatch.players) {
              if (player.payRequestId) {
                await server.deletePlayerAndReturnBet(table, player)
              }
            }

            await tx.matchBet.delete({ where: { matchId: table.matchId } })
            await tx.match.delete({ where: { id: table.matchId } })
          })
        }

        await server.getTableSockets(table, async (playerSocket, player) => {
          playerSocket.leave(table.matchSessionId)
          if (player) {
            playerSocket.leave(table.matchSessionId + player.teamIdx)
          }
        })

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

        await server.getTableSockets(table, async (socket) => {
          socket.emit(EServerEvent.MATCH_DELETED, matchSessionId)
        })

        server.tables.delete(matchSessionId)
        server.chat.delete(matchSessionId)
        server.turns.delete(matchSessionId)

        server.io.to("searching").emit(EServerEvent.UPDATE_PUBLIC_MATCHES, server.tables.getAll())

        log.trace({ matchSessionId }, "Deleted Match Table")
      } catch (e) {
        log.error(e, "Error cleaning up MatchTable")
      }
    },
  }

  const _getPossiblePlayingMatch = (
    matchSessionId: string,
    session: string
  ): { table: IMatchTable; player?: IPlayer; user?: IUserData } | null => {
    const table = server.tables.get(matchSessionId)
    log.trace(
      { session, matchSessionId, table },
      "Trying to get match room to check if session is in it"
    )
    if (table) {
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

    log.trace({ matchId: room, socketId }, "Player socket joined match room")

    userSession.reconnect(table.matchSessionId, "disconnection")
  })

  return server
}
