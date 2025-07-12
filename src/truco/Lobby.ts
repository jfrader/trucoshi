import { GAME_ERROR, ILobbyOptions, IPlayer, ITeam } from "../types"
import {
  ITable,
  PLAYER_ABANDON_TIMEOUT,
  PLAYER_TURN_TIMEOUT,
  PREVIOUS_HAND_ACK_TIMEOUT,
  TEAM_SIZE_VALUES,
  Table,
} from "../lib"
import { IQueue, Queue } from "../lib/classes/Queue"
import { SocketError } from "../server"
import logger from "../utils/logger"
import { GameLoop, IGameLoop } from "./GameLoop"
import { Match } from "./Match"
import { Player } from "./Player"
import { Team } from "./Team"

const log = logger.child({ class: "Lobby" })

const envHandAckTimeout = process.env.APP_PREVIOUS_HAND_ACK_TIMEOUT
const disableTimer = process.env.APP_DISABLE_TURN_TIMER === "1"

export const DEFAULT_LOBBY_OPTIONS: ILobbyOptions = {
  faltaEnvido: 1,
  flor: true,
  matchPoint: 9,
  maxPlayers: 6,
  handAckTime: envHandAckTimeout ? Number(envHandAckTimeout) : PREVIOUS_HAND_ACK_TIMEOUT,
  turnTime: disableTimer ? 99999 * 1000 : PLAYER_TURN_TIMEOUT,
  abandonTime: PLAYER_ABANDON_TIMEOUT,
  satsPerPlayer: 0,
}

export interface IPrivateLobby {
  options: ILobbyOptions
  gameLoop?: IGameLoop
  lastTeamIdx: 0 | 1
  _players: Array<IPlayer | { name?: undefined; session?: undefined; teamIdx?: undefined }>
  get players(): Array<IPlayer>
  teams: Array<ITeam>
  table: ITable | null
  addQueue: IQueue
  removeQueue: IQueue
  full: boolean
  ready: boolean
  started: boolean
  addPlayer(args: {
    accountId?: number | undefined
    avatarUrl?: string | undefined | null
    key: string
    name: string
    session: string
    teamIdx?: 0 | 1
    isOwner?: boolean
  }): Promise<IPlayer>
  removePlayer(session: string): Promise<ILobby>
  calculateReady(): boolean
  calculateFull(): boolean
  setOptions(options: Partial<ILobbyOptions>): void
  isEmpty(): boolean
  startMatch(matchPoint?: 9 | 12 | 15): IGameLoop
}

export interface ILobby
  extends Pick<
    IPrivateLobby,
    | "setOptions"
    | "addPlayer"
    | "removePlayer"
    | "startMatch"
    | "isEmpty"
    | "options"
    | "ready"
    | "full"
    | "started"
    | "teams"
    | "players"
    | "gameLoop"
    | "table"
    | "calculateReady"
  > {}

export function Lobby(matchId: string, options: Partial<ILobbyOptions> = {}): ILobby {
  const lobby: IPrivateLobby = {
    options: Object.assign(structuredClone(DEFAULT_LOBBY_OPTIONS), options),
    lastTeamIdx: 1,
    _players: [],
    get players() {
      return lobby._players.filter((player) => Boolean(player && player.name)) as IPlayer[]
    },
    teams: [],
    addQueue: Queue(),
    removeQueue: Queue(),
    table: null,
    full: false,
    ready: false,
    started: false,
    gameLoop: undefined,
    setOptions(value) {
      if (lobby.started) {
        return new SocketError(
          "MATCH_ALREADY_STARTED",
          "No se pudo actualizar las opciones, la partida ya empezo"
        )
      }

      if (value.maxPlayers && value.maxPlayers < lobby.players.length) {
        return new SocketError("FORBIDDEN", "Hay mas jugadores que espacio disponible")
      }

      lobby.options = { ...lobby.options, ...value }
    },
    isEmpty() {
      return !lobby.players.length
    },
    calculateReady() {
      return calculateLobbyReadyness(lobby)
    },
    calculateFull() {
      return calculateLobbyFullness(lobby)
    },
    async addPlayer({ accountId, key, name, session, teamIdx, isOwner, avatarUrl }) {
      let player: IPlayer | null = null
      await lobby.addQueue.queue(async () => {
        try {
          player = await addPlayerToLobby({
            accountId,
            lobby,
            name,
            session,
            key,
            isOwner,
            avatarUrl: avatarUrl || undefined,
            teamIdx,
            teamSize: lobby.options.maxPlayers / 2,
          })
        } catch (e) {
          log.error(e, "Error while adding player to match")
        }
      })
      if (player) {
        log.trace({ player: (player as any).id }, "Adding player to match table lobby")
        return player
      }
      throw new Error("Couldn't add player to match")
    },
    async removePlayer(session) {
      await lobby.removeQueue.queue(() => {
        const idx = lobby._players.findIndex((player) => player && player.session === session)
        if (idx !== -1) {
          lobby._players[idx] = {}
          lobby.calculateFull()
          lobby.calculateReady()
        }
      })
      return lobby
    },
    startMatch() {
      return startLobbyMatch(matchId, lobby)
    },
  }

  for (let i = 0; i < lobby.options.maxPlayers; i++) {
    lobby._players.push({})
  }

  lobby.teams = [Team(0), Team(1)]

  return lobby
}

const startLobbyMatch = (matchId: string, lobby: IPrivateLobby) => {
  lobby.calculateReady()
  const actualTeamSize = lobby.players.length / 2

  if (!TEAM_SIZE_VALUES.includes(actualTeamSize)) {
    throw new Error(GAME_ERROR.UNEXPECTED_TEAM_SIZE)
  }

  if (!lobby.ready) {
    throw new Error(GAME_ERROR.TEAM_NOT_READY)
  }

  for (const team of lobby.teams) {
    team.setPlayers(lobby.players.filter((player) => player.teamIdx === team.id))
  }

  if (
    lobby.teams[0].players.length !== actualTeamSize ||
    lobby.teams[1].players.length !== actualTeamSize
  ) {
    throw new Error(GAME_ERROR.UNEXPECTED_TEAM_SIZE)
  }

  lobby.table = Table(lobby.players)
  lobby.gameLoop = GameLoop(Match(matchId, lobby.table, lobby.teams, lobby.options))

  lobby.started = true
  return lobby.gameLoop
}

const calculateLobbyFullness = (lobby: IPrivateLobby) => {
  lobby.full = lobby.players.length >= lobby.options.maxPlayers
  return lobby.full
}

const calculateLobbyReadyness = (lobby: IPrivateLobby) => {
  const allPlayersReady = lobby.players.reduce(
    (prev, curr) => Boolean(prev && curr && curr.ready),
    true
  )

  const teamsSameSize =
    lobby.players.filter((player) => player.teamIdx === 0).length ===
    lobby.players.filter((player) => player.teamIdx === 1).length

  const allTeamsComplete = lobby.players.length % 2 === 0

  lobby.ready = allPlayersReady && allTeamsComplete && teamsSameSize
  return lobby.ready
}

const addPlayerToLobby = async ({
  accountId,
  avatarUrl,
  lobby,
  name,
  session,
  key,
  teamIdx,
  isOwner,
  teamSize,
}: {
  accountId: number | undefined
  avatarUrl: string | undefined
  lobby: IPrivateLobby
  name: string
  session: string
  key: string
  teamIdx?: 0 | 1
  isOwner?: boolean
  teamSize: number
}): Promise<IPlayer> => {
  const playerParams = { accountId, avatarUrl, name, key, teamIdx, isOwner }
  log.trace(playerParams, "Adding player to match started")

  const existing = lobby.players.find((p) => p.session === session)
  const hasMovedSlots = Boolean(existing)

  const resolvedTeamIdx: 0 | 1 =
    teamIdx !== undefined ? teamIdx : (Number(!lobby.lastTeamIdx) as 0 | 1)
  const resolvedIsOwner = existing?.isOwner ?? isOwner

  if (lobby.started) {
    log.trace(playerParams, "Match already started")
    throw new Error(GAME_ERROR.MATCH_ALREADY_STARTED)
  }

  if (existing) {
    if (existing.teamIdx === resolvedTeamIdx) {
      log.trace(playerParams, "Player already on same team, skipping add")
      return existing
    }

    log.trace(playerParams, "Player moving teams, removing old slot")
    await lobby.removePlayer(session)
  }

  if (lobby.full) {
    log.trace(playerParams, "Lobby is full")
    throw new Error(GAME_ERROR.LOBBY_IS_FULL)
  }

  // Count players already on the target team
  const teamPlayerCount = lobby.players.filter((p) => p.teamIdx === resolvedTeamIdx).length
  if (teamPlayerCount >= teamSize) {
    log.trace(playerParams, "Team is full")
    throw new Error(GAME_ERROR.TEAM_IS_FULL)
  }

  const player = Player({
    accountId,
    key,
    name,
    isOwner: resolvedIsOwner,
    avatarUrl,
    teamIdx: resolvedTeamIdx,
  })
  player.setSession(session)
  lobby.lastTeamIdx = resolvedTeamIdx

  // Find appropriate open slot for the team
  const findTeamSlot = (teamIdx: 0 | 1): number => {
    const start = teamIdx === 0 ? 0 : 1
    for (let i = start; i < lobby._players.length; i += 2) {
      if (!lobby._players[i].name) return i
    }
    return -1
  }

  const slotIndex = findTeamSlot(resolvedTeamIdx)
  if (slotIndex === -1) {
    log.trace(playerParams, "No slot available for team")
    throw new Error(GAME_ERROR.TEAM_IS_FULL)
  }

  lobby._players[slotIndex] = player

  if (hasMovedSlots) {
    // Rebalance slots left behind
    for (let i = 0; i < lobby._players.length; i++) {
      if (!lobby._players[i].name) {
        for (let j = i + 2; j < lobby._players.length; j += 2) {
          if (lobby._players[j].name) {
            const ref = lobby._players[j] as IPlayer
            lobby._players[j] = {}
            lobby._players[i] = ref
            break
          }
        }
      }
    }
  }

  lobby.calculateFull()
  lobby.calculateReady()

  log.trace({ playerParams, player: player.getPublicPlayer() }, "Player added to match")
  return player
}
