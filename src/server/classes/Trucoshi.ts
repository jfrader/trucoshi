import { randomUUID } from "crypto"
import { createServer, Server as HttpServer } from "http"
import { Server, Socket } from "socket.io"
import {
  EAnswerCommand,
  ECommand,
  EHandState,
  ESayCommand,
  GAME_ERROR,
  ICard,
  ILobbyOptions,
  IMatchDetails,
  IPlayer,
  IPublicMatch,
  IPublicMatchInfo,
  IPublicPlayer,
  ITeam,
  IUserData,
  IWaitingPlayData,
} from "../../types"
import {
  MATCH_FINISHED_CLEANUP_TIMEOUT,
  PLAYER_LOBBY_TIMEOUT,
  PLAYER_TIMEOUT_GRACE,
} from "../constants"
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

const log = logger.child({ class: "Trucoshi" })

interface ITrucoshiTurn {
  play: IPlayInstance
  timeout: NodeJS.Timeout
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

    return results
  }
}

interface InterServerEvents {}

interface SocketData {
  user?: IUserData
  matches: TMap<string, ISocketMatchState>
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
  store?: PrismaClient
  chat: IChat
  tables: MatchTableMap // sessionId, table
  sessions: TMap<string, IUserSession> // sessionId, user
  turns: TMap<string, ITrucoshiTurn> // sessionId, play instance
  createUserSession(socket: TrucoshiSocket, username?: string, token?: string): IUserSession
  getTableSockets(
    table: IMatchTable,
    callback?: (playerSocket: TrucoshiSocket, player: IPlayer | null) => Promise<void>
  ): Promise<{ sockets: any[]; players: IPublicPlayer[]; spectators: any[] }>
  getSessionActiveMatches(session?: string): IPublicMatchInfo[]
  login(input: { socket: TrucoshiSocket; account: User; identityJwt: string }): Promise<void>
  logout(socket: TrucoshiSocket): void
  emitSocketSession(socket: TrucoshiSocket): Promise<void>
  leaveMatch(matchId: string, socket: TrucoshiSocket, force?: boolean): Promise<void>
  emitWaitingPossibleSay(
    play: IPlayInstance,
    table: IMatchTable,
    freshHand?: boolean
  ): Promise<ECommand | number>
  emitWaitingForPlay(
    play: IPlayInstance,
    table: IMatchTable,
    freshHand?: boolean
  ): Promise<"say" | "play">
  emitMatchUpdate(table: IMatchTable, skipSocketIds?: Array<string>): Promise<void>
  emitPreviousHand(hand: IHand, table: IMatchTable): Promise<void>
  emitSocketMatch(socket: TrucoshiSocket, currentMatchId: string | null): IPublicMatch | null
  playCard(input: {
    table: IMatchTable
    play: IPlayInstance
    player: IPlayer
    cardIdx: number
    card: ICard
  }): Promise<void>
  sayCommand(input: {
    table: IMatchTable
    play: IPlayInstance
    player: IPlayer
    command: ECommand | number
  }): Promise<ECommand | number>
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
  joinMatch(table: IMatchTable, userSession: IUserSession, teamIdx?: 0 | 1): Promise<IPlayer>
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
  setTurnTimeout(
    table: IMatchTable,
    player: IPlayer,
    user: IUserSession,
    retry: () => void,
    cancel: () => void
  ): NodeJS.Timeout
  onHandFinished(table: IMatchTable, hand: IHand | null): Promise<void>
  onTurn(table: IMatchTable, play: IPlayInstance): Promise<void>
  onTruco(table: IMatchTable, play: IPlayInstance): Promise<void>
  onEnvido(table: IMatchTable, play: IPlayInstance, isPointsRounds: boolean): Promise<void>
  onWinner(table: IMatchTable, winner: ITeam): Promise<void>
  removePlayerAndCleanup(table: IMatchTable, player: IPlayer): Promise<void>
  deletePlayerAndReturnBet(table: IMatchTable, player: MatchPlayer): Promise<void>
  cleanupMatchTable(table: IMatchTable): Promise<void>
  getAccountDetails(
    socket: TrucoshiSocket,
    accountId: number
  ): Promise<{ stats: UserStats | null; matches: Array<Match>; account: User }>
  getMatchDetails(socket: TrucoshiSocket, matchId: number): Promise<IMatchDetails>
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

  const pubClient = createClient({ url: process.env.REDIS_URL })
  const subClient = pubClient.duplicate()

  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(
    httpServer,
    {
      cors: {
        credentials: true,
        origin,
        methods: ["GET", "POST"],
      },
    }
  )

  const chat = Chat(io)

  const sessions = new TMap<string, IUserSession>() // sessionId (token), user
  const tables = new MatchTableMap() // sessionId, table
  const turns = new TMap<string, ITrucoshiTurn>() // sessionId, play instance, play promise resolve and type

  const server: ITrucoshi = {
    sessions,
    store: undefined,
    tables,
    turns,
    io,
    httpServer,
    chat,
    async listen(
      callback,
      { redis = true, lightningAccounts = true, store = true } = {
        redis: true,
        lightningAccounts: true,
        store: true,
      }
    ) {
      if (lightningAccounts) {
        try {
          await accountsApi.auth.getAuth()
          log.info("Logged in to lightning-accounts")
        } catch (e) {
          log.error(e, "Failed to login to lightning-accounts")
        }
      }

      if (redis) {
        try {
          await Promise.all([pubClient.connect(), subClient.connect()])
          io.adapter(createAdapter(pubClient, subClient))
          log.info("Connected to Redis")
        } catch (e) {
          log.error(e, "Failed to connect to Redis")
        }
      }

      if (store) {
        server.store = new PrismaClient()
        try {
          await server.store.$connect()
          log.info("Connected to Postgres")
        } catch (e) {
          log.error(e, "Failed to connect to Postgres")
        }

        try {
          const unpaidMatches = await server.store.match.findMany({
            where: {
              bet: { satsPerPlayer: { gt: 0 }, winnerAwarded: false },
            },
            include: { bet: true, players: true },
          })

          if (unpaidMatches.length > 0) {
            log.error(
              { unpaidMatchesLength: unpaidMatches.length },
              "Found matches that had outstanding bets, trying to repay players entrance sats..."
            )
          }

          for (const match of unpaidMatches) {
            log.debug(
              { matchId: match.id, sessionId: match.sessionId },
              "Trying to repay bets to players on this match..."
            )
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
                  log.debug(
                    {
                      matchId: match.id,
                      sessionId: match.sessionId,
                      playerAccountId: player.accountId,
                      satsPaid: player.satsPaid,
                      satsReceived: player.satsReceived,
                      amountInSats,
                    },
                    "Nothing to pay to this player"
                  )
                  continue
                }

                log.debug(
                  {
                    matchId: match.id,
                    sessionId: match.sessionId,
                    playerAccountId: player.accountId,
                    amountInSats,
                  },
                  "Looking for paid pay request"
                )

                const pr = await accountsApi.wallet.payRequestDetail(String(player.payRequestId))

                log.debug(
                  {
                    isPaid: pr.data.paid,
                    payRequestId: pr.data.id,
                  },
                  "Found Pay Request..."
                )

                if (pr.data.paid) {
                  log.debug(
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
          log.error(e, "Failed to repay unpaid matches")
        }
      }

      io.listen(port)
      server.chat = Chat(io)
      callback(io)
      return io
    },
    getSessionActiveMatches(session) {
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
        .map((match) => match.getPublicMatchInfo())
    },
    createUserSession(socket, id, token) {
      const session = token || randomUUID()
      const key = randomUUID()
      const userSession = UserSession(key, id || "Satoshi", session)
      socket.data.user = userSession
      socket.data.matches = new TMap()
      server.sessions.set(session, userSession)

      return userSession
    },
    async login({ socket, account, identityJwt }) {
      if (!socket.data.user) {
        throw new Error("Socket doesn't have user data")
      }

      const payload = validateJwt(identityJwt, account)

      socket.leave(socket.data.user.session)

      const session =
        server.sessions.find((s) => s.account?.id === payload.sub) ||
        server.createUserSession(socket)

      const res = await accountsApi.users.usersDetail(String(payload.sub))

      session.setAccount(res.data)
      session.setName(res.data.name)
      socket.data.user = session.getUserData()
      socket.join(session.session)

      server.emitSocketSession(socket)

      log.debug(socket.data.user, "Logging in account")
    },
    logout(socket) {
      if (!socket.data.user) {
        throw new Error("Socket doesn't have user data")
      }

      const userSession = server.sessions.getOrThrow(socket.data.user.session)
      server.sessions.delete(userSession.session)

      log.debug(socket.data.user, "Logging out account")
    },
    async emitSocketSession(socket) {
      if (!socket.data.user) {
        return
      }
      const activeMatches = server.getSessionActiveMatches(socket.data.user.session)
      socket.emit(EServerEvent.SET_SESSION, socket.data.user, serverVersion, activeMatches)
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
      await server.getTableSockets(table, async (playerSocket, player) => {
        if (skipSocketIds.includes(playerSocket.id) || !playerSocket.data.user) {
          return
        }
        playerSocket.emit(
          EServerEvent.UPDATE_MATCH,
          table.getPublicMatch(player ? (playerSocket.data.user.session as string) : undefined)
        )
      })
    },
    async emitWaitingPossibleSay(play, table, freshHand = false) {
      log.trace(
        { match: table.getPublicMatchInfo(), handIdx: play.handIdx },
        "Emitting match possible players say"
      )
      return new Promise<ECommand | number>((resolve, reject) => {
        return server
          .getTableSockets(table, async (playerSocket, player) => {
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

            playerSocket.emit(
              EServerEvent.WAITING_POSSIBLE_SAY,
              table.getPublicMatch(player.session, freshHand),
              (data) => {
                if (!data) {
                  return
                }
                if (!play.waitingPlay) {
                  log.trace(
                    { match: table.getPublicMatchInfo(), player: player.getPublicPlayer() },
                    "Tried to say something but someone said something already"
                  )
                  return
                }
                const { command } = data
                server
                  .sayCommand({ table, play, player, command })
                  .then((command) => {
                    resolve(command)
                    server.sessions.getOrThrow(player.session).reconnect(table.matchSessionId)
                  })
                  .catch(reject)
              }
            )
          })
          .catch(log.error)
      })
    },
    async emitWaitingForPlay(play, table, freshHand) {
      return new Promise<"say" | "play">((resolve, reject) => {
        server
          .emitWaitingPossibleSay(play, table, freshHand)
          .then(() => resolve("say"))
          .catch((e) => log.error(e, "Error on emitWaitingForPlay, rejected waitingPossibleSay"))
        return server
          .getTableSockets(table, async (playerSocket, player) => {
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
                    return
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
          .catch(log.error)
      })
    },
    sayCommand({ table, play, player, command }) {
      return new Promise<ECommand | number>((resolve, reject) => {
        if (command || command === 0) {
          log.trace({ player, command }, "Attempt to say command")
          const saidCommand = play.say(command, player)
          if (saidCommand || saidCommand === 0) {
            log.trace({ player, command }, "Say command success")
            clearTimeout(server.turns.getOrThrow(table.matchSessionId).timeout)

            server.chat.rooms
              .getOrThrow(table.matchSessionId)
              .command(player.teamIdx as 0 | 1, saidCommand)

            return server
              .resetSocketsMatchState(table)
              .then(() => resolve(saidCommand))
              .catch(reject)
          }
          return reject(new Error("Invalid Command " + command))
        }
        return reject(new Error("Undefined Command"))
      })
    },
    playCard({ table, play, player, cardIdx, card }) {
      return new Promise<void>((resolve, reject) => {
        if (cardIdx !== undefined && card) {
          log.trace({ player, card, cardIdx }, "Attempt to play card")
          const playedCard = play.use(cardIdx, card)
          if (playedCard) {
            log.trace({ player, card, cardIdx }, "Play card success")
            clearTimeout(server.turns.getOrThrow(table.matchSessionId).timeout)

            server.chat.rooms.getOrThrow(table.matchSessionId).card(player, playedCard)
            return server.resetSocketsMatchState(table).then(resolve).catch(reject)
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
    async emitPreviousHand(hand, table) {
      log.trace(table.getPublicMatchInfo(), "Emitting previous hand to players")

      const previousHand = table.getPreviousHand(hand)

      const promises: Array<PromiseLike<void>> = []
      await server.getTableSockets(table, async (playerSocket, player) => {
        promises.push(
          new Promise<void>((resolvePlayer, rejectPlayer) => {
            if (!player || !hand) {
              return rejectPlayer()
            }
            playerSocket.emit(EServerEvent.PREVIOUS_HAND, previousHand, resolvePlayer)
            setTimeout(rejectPlayer, table.lobby.options.handAckTime + PLAYER_TIMEOUT_GRACE)
          }).catch(log.error)
        )
      })

      table.lobby.teams.map((team) => {
        server.chat.rooms
          .getOrThrow(table.matchSessionId)
          .system(`${team.name}: +${previousHand.points[team.id]}`)
      })

      log.trace(
        table.getPublicMatchInfo(),
        "Previous hand timeout has finished, all players settled for next hand"
      )
      await Promise.allSettled(promises)
    },
    setTurnTimeout(table, player, user, onReconnection, onTimeout) {
      log.trace({ player, options: table.lobby.options }, "Setting turn timeout")
      player.setTurnExpiration(table.lobby.options.turnTime, table.lobby.options.abandonTime)

      const chat = server.chat.rooms.getOrThrow(table.matchSessionId)

      return setTimeout(() => {
        log.trace(
          { match: table.getPublicMatchInfo(), player: player.getPublicPlayer() },
          "Turn timed out, disconnecting"
        )

        table.playerDisconnected(player)

        user
          .waitReconnection(table.matchSessionId, table.lobby.options.abandonTime)
          .then(() => {
            log.trace(
              { match: table.getPublicMatchInfo(), player: player.getPublicPlayer() },
              "Player reconnected"
            )
            table.playerReconnected(player)
            onReconnection()
          })
          .catch(() => {
            log.trace(
              { match: table.getPublicMatchInfo(), player: player.getPublicPlayer() },
              "Player abandoned"
            )
            table.playerAbandoned(player)
            chat.system(`${player.name} se retiro de la partida.`)
            onTimeout()
          })
          .finally(() => server.emitMatchUpdate(table).catch(log.error))
      }, table.lobby.options.turnTime + PLAYER_TIMEOUT_GRACE)
    },
    onTurn(table, play) {
      log.trace(
        { match: table.getPublicMatchInfo(), player: play.player, handIdx: play.handIdx },
        "Turn started"
      )
      return new Promise<void>((resolve, reject) => {
        const session = play.player?.session
        if (!session || !play || !play.player) {
          throw new Error("No session, play instance or player found")
        }

        const player = play.player
        const user = server.sessions.getOrThrow(session)

        const turn = () =>
          server
            .emitWaitingForPlay(play, table, play.freshHand)
            .then(() => {
              resolve()
            })
            .catch((e) => {
              log.error(e, "ONTURN CALLBACK ERROR")
              turn()
            })

        turn()

        const timeout = server.setTurnTimeout(table, player, user, turn, () =>
          server
            .sayCommand({ table, play, player, command: ESayCommand.MAZO })
            .catch((e) => log.error(e, "Turn timeout retry say command MAZO failed"))
            .finally(resolve)
        )

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
      return new Promise<void>((resolve, reject) => {
        const session = play.player?.session
        if (!session || !play || !play.player) {
          throw new Error("No session, play instance or player found")
        }

        const turn = () =>
          server
            .emitWaitingPossibleSay(play, table)
            .then(() => resolve())
            .catch((e) => {
              log.error(e, "ONTRUCO CALLBACK ERROR")
              turn()
            })

        turn()

        const player = play.player
        const user = server.sessions.getOrThrow(session)

        const timeout = server.setTurnTimeout(table, player, user, turn, () =>
          server
            .sayCommand({ table, play, player, command: EAnswerCommand.NO_QUIERO })
            .catch((e) => log.error(e, "Truco turn timeout retry say command NO_QUIERO failed"))
            .finally(resolve)
        )

        server.turns.set(table.matchSessionId, {
          play,
          resolve,
          timeout,
        })
      })
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

        const turn = () =>
          server
            .emitWaitingPossibleSay(play, table)
            .then(() => resolve())
            .catch((e) => {
              log.error(e, "ONENVIDO CALLBACK ERROR")
              turn()
            })

        turn()

        const player = play.player
        const user = server.sessions.getOrThrow(session)

        const timeout = server.setTurnTimeout(table, player, user, turn, () => {
          if (isPointsRound) {
            return server
              .sayCommand({ table, play, player, command: 0 })
              .catch((e) => log.error(e, "Envido turn timeout failed to say '0' points command"))
              .finally(resolve)
          }
          server
            .sayCommand({ table, play, player, command: EAnswerCommand.NO_QUIERO })
            .catch((e) => log.error(e, "Envido turn timeout failed to say NO_QUIERO command"))
            .finally(resolve)
        })

        server.turns.set(table.matchSessionId, {
          play,
          resolve,
          timeout,
        })
      })
    },
    onHandFinished(table, hand) {
      if (!hand) {
        log.error({ matchId: table.matchSessionId }, "Hand finished but there's no previous hand!")
        return Promise.resolve()
      }

      log.trace(`Table hand finished - Table State: ${table.state()}`)

      return new Promise<void>((resolve, reject) => {
        server
          .emitPreviousHand(hand, table)
          .then(resolve)
          .catch((e) => {
            log.error(e, "ONHANDFINISHED CALLBACK ERROR")
            reject(e)
          })
      })
    },
    onWinner(table, winner) {
      return new Promise<void>((resolve) => {
        log.trace(table.getPublicMatchInfo(), "Match has finished with a winner")

        const chat = server.chat.rooms.getOrThrow(table.matchSessionId)
        chat.system(`${winner.name} es el equipo ganador!`)

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

        setTimeout(() => {
          server.cleanupMatchTable(table)
        }, MATCH_FINISHED_CLEANUP_TIMEOUT)
      })
    },
    async createMatchTable(matchSessionId, userSession) {
      const table = MatchTable(matchSessionId, userSession.session)

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

      return table
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

      if (satsPerPlayer !== undefined && currentOptions.satsPerPlayer !== satsPerPlayer) {
        if (satsPerPlayer > 0) {
          if (
            process.env.NODE_MAX_BET &&
            Number(process.env.NODE_MAX_BET) > 0 &&
            satsPerPlayer > Number(process.env.NODE_MAX_BET)
          ) {
            throw new SocketError("FORBIDDEN", "Maximo " + process.env.NODE_MAX_BET + " sats")
          }

          if (!server.store) {
            throw new Error("This server doesn't support bets")
          }

          if (!identityJwt || !userSession.account) {
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

          guestSessions.forEach((session) => {
            table.lobby.removePlayer(session)
          })

          server.getTableSockets(table, async (playerSocket) => {
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

      table.lobby.players.forEach((player) => {
        player.setPayRequest(payRequests.find((pr) => pr.receiver?.id === player.accountId)?.id)
        player.setReady(false)
      })

      return table
    },
    async kickPlayer({ matchSessionId, userSession, key }) {
      const table = server.tables.getOrThrow(matchSessionId)
      const player = table.isSessionPlaying(userSession.session)

      if (table.state() === EMatchState.STARTED || table.state() === EMatchState.FINISHED) {
        throw new SocketError("FORBIDDEN")
      }

      if (table.busy || !player || !player.isOwner || key === player.key) {
        throw new SocketError("FORBIDDEN")
      }

      const session = table.lobby.players.find((p) => p.key === key)?.session

      if (!session) {
        throw new SocketError("NOT_FOUND")
      }

      await table.lobby.removePlayer(session)
      server.emitMatchUpdate(table).catch(log.error)
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
        } as Pick<
          MatchPlayer,
          "session" | "accountId" | "name" | "teamIdx" | "payRequestId" | "satsPaid"
        >

        if (pr && pr.id) {
          update.satsPaid = pr.amountInSats
          update.payRequestId = pr.id
        }

        log.debug({ update }, "About to update or create match player")

        if (dbPlayerExists) {
          const dbPlayer = await server.store.matchPlayer.update({
            where: { id: dbPlayerExists.id },
            data: update,
          })
          player.setMatchPlayerId(dbPlayer.id)
          log.debug({ dbPlayer }, "Updated match player")
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
          log.debug({ dbPlayer }, "Created match player")
        }
      }

      player.setReady(ready)

      server.emitMatchUpdate(table).catch(log.error)

      return table
    },
    async joinMatch(table, userSession, teamIdx) {
      let prId: number | undefined
      let matchPlayerId: number | undefined
      if (table.lobby.options.satsPerPlayer > 0) {
        if (!userSession.account?.id) {
          throw new Error("Player needs to be logged into an account to join this match")
        }

        const currentPlayer = table.isSessionPlaying(userSession.session)
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

      return player
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

      table.lobby
        .startMatch()
        .onHandFinished(async (hand) => {
          if (server.store && hand) {
            await server.store.matchHand.create({
              data: {
                clientSecrets: hand.clientSecrets,
                secret: hand.secret,
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
        .onEnvido(server.onEnvido.bind(null, table))
        .onTruco(server.onTruco.bind(null, table))
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
                const rake = Number(process.env.NODE_RAKE_PERCENT) || 0
                const pool = satsPerPlayer * table.lobby.players.length
                const tax = Math.round((pool * rake) / 100) || rake
                const prize = pool - tax
                const winnersLength = winnerTeam.players.filter((p) => !p.abandoned).length
                const amountInSats = Math.floor(prize / winnersLength)

                logger.debug(
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
                  })
                }
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
          }

          return server.onWinner(table, winnerTeam)
        })
        .begin()
        .then(() => log.trace(table.getPublicMatchInfo(), "Match finished"))
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
    },
    emitSocketMatch(socket, matchId) {
      if (!matchId) {
        return null
      }

      const currentTable = server.tables.get(matchId)

      if (currentTable) {
        socket.join(currentTable.matchSessionId)

        if (!socket.data.user?.session) {
          return null
        }

        if (socket.data.matches) {
          socket.data.matches.set(currentTable.matchSessionId, {
            isWaitingForPlay: false,
            isWaitingForSay: false,
          })
        }

        const userSession = server.sessions.get(socket.data.user.session)

        if (!userSession) {
          log.warn({ socket: socket.id, matchId }, "Session not found")
          return null
        }

        userSession.reconnect(currentTable.matchSessionId)

        const { play, resolve } = server.turns.get(currentTable.matchSessionId) || {}
        if (play && play.player && currentTable.isSessionPlaying(socket.data.user.session)) {
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
            server.emitWaitingForPlay(play, currentTable).then(resolve).catch(log.error)
          } else {
            log.trace(
              {
                ...socket.data.user,
                socket: socket.id,
              },
              "Emitting user's socket current playing match: waiting possible say"
            )
            server.emitWaitingPossibleSay(play, currentTable).then(resolve).catch(log.error)
          }
        }

        server.chat.rooms.get(currentTable.matchSessionId)?.socket.emit(socket.id)

        return currentTable.getPublicMatch(socket.data.user.session)
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

        log.debug(
          { player, matchSessionId: table.matchSessionId },
          "Socket left a match lobby that had bets paid by the player, giving sats back if needed..."
        )

        if (player && player.accountId && player.satsPaid > 0) {
          const amountInSats = player.satsPaid - player.satsReceived

          if (!amountInSats) {
            log.debug(
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

          logger.debug(
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

              log.info(
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

            log.debug(
              { player: player.getPublicPlayer(), matchSessionId: table.matchSessionId },
              "Socket left a match and it didn't start yet, checking..."
            )

            if (server.store && userSession.account && table.lobby.options.satsPerPlayer > 0) {
              const dbPlayer = await server.store.matchPlayer.findUniqueOrThrow({
                where: { id: player.matchPlayerId },
              })
              await server.deletePlayerAndReturnBet(table, dbPlayer)
              return server.removePlayerAndCleanup(table, player)
            }

            userSession
              .waitReconnection(table.matchSessionId, PLAYER_LOBBY_TIMEOUT)
              .then(() => {
                table.playerReconnected(player)
              })
              .catch(() => {
                table.playerAbandoned(player)
                return server.removePlayerAndCleanup(table, player)
              })
              .catch((e) => log.error(e, "Failed to remove player and cleanup"))
              .finally(() => server.emitMatchUpdate(table).catch(log.error))
            return
          }

          if (force) {
            log.debug(
              { player: player.getPublicPlayer(), matchSessionId: table.matchSessionId },
              "Socket left a match forcibly while playing, abandoning..."
            )

            const turn = server.turns.getOrThrow(table.matchSessionId)

            await server.sayCommand({
              table,
              command: ESayCommand.MAZO,
              player,
              play: turn.play,
            })

            server.chat.rooms
              .getOrThrow(table.matchSessionId)
              .system(`${player.name} ha abandonado la partida`)

            table.playerDisconnected(player)
            table.playerAbandoned(player)
            turn.resolve()
            server.emitMatchUpdate(table).catch(log.error)
          }
        }
      } catch (e) {
        log.error(e, "Failed to leave match!")
      }
    },
    async removePlayerAndCleanup(table, player) {
      try {
        log.debug(
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
          hands: true,
          players: { select: { accountId: true, id: true, name: true, teamIdx: true, idx: true } },
        },
      })

      const isPlayer =
        match.players.findIndex((p) => p.accountId === socket.data.user?.account?.id) !== -1

      return isPlayer
        ? match
        : {
            ...match,
            options: { ...(match.options as any), satsPerPlayer: 0 },
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
    async cleanupMatchTable(table) {
      const matchSessionId = table.matchSessionId
      log.debug({ table: table.getPublicMatchInfo() }, "Cleaning up match table")
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

        for (const player of table.lobby.players) {
          const userSession = server.sessions.getOrThrow(player.session)
          userSession.resolveWaitingPromises(matchSessionId)
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
        log.debug({ matchSessionId }, "Deleted Match Table")
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

    log.debug({ matchId: room, socketId }, "Player socket joined match room")

    userSession.reconnect(table.matchSessionId)
  })

  return server
}
