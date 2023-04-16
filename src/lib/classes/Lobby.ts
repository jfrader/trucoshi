import { TEAM_SIZE_VALUES } from "../constants"
import { GAME_ERROR } from "../../types"
import { GameLoop, IGameLoop } from "./GameLoop"
import { Match } from "./Match"
import { IPlayer, Player } from "./Player"
import { ITable, Table } from "./Table"
import { ITeam, Team } from "./Team"
import { IQueue, Queue } from "./Queue"
import logger from "../../etc/logger"

export interface IPrivateLobby {
  gameLoop?: IGameLoop
  lastTeamIdx: 0 | 1
  _players: Array<IPlayer | { id?: undefined; session?: undefined; teamIdx?: undefined }>
  get players(): Array<IPlayer>
  teams: Array<ITeam>
  maxPlayers: number
  table: ITable | null
  queue: IQueue
  full: boolean
  ready: boolean
  started: boolean
  _addPlayer(key: string, id: string, session: string, teamIdx?: 0 | 1, isOwner?: boolean): IPlayer
  addPlayer(
    key: string,
    id: string,
    session: string,
    teamIdx?: 0 | 1,
    isOwner?: boolean
  ): Promise<IPlayer>
  removePlayer(session: string): ILobby
  calculateReady(): boolean
  calculateFull(): boolean
  startMatch(matchPoint?: 9 | 12 | 15): IGameLoop
}

export interface ILobby
  extends Pick<
    IPrivateLobby,
    | "addPlayer"
    | "removePlayer"
    | "startMatch"
    | "ready"
    | "full"
    | "started"
    | "teams"
    | "players"
    | "gameLoop"
    | "table"
    | "maxPlayers"
    | "calculateReady"
  > {}

export function Lobby(teamSize?: 1 | 2 | 3): ILobby {
  const lobby: IPrivateLobby = {
    lastTeamIdx: 1,
    _players: [],
    get players() {
      return lobby._players.filter((player) => Boolean(player && player.id)) as IPlayer[]
    },
    teams: [],
    queue: Queue(),
    table: null,
    maxPlayers: teamSize ? teamSize * 2 : 6,
    full: false,
    ready: false,
    started: false,
    gameLoop: undefined,
    calculateReady() {
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
    },
    calculateFull() {
      lobby.full = lobby.players.length >= lobby.maxPlayers
      return lobby.full
    },
    async addPlayer(...params) {
      return lobby.queue.queue(() => lobby._addPlayer(...params))
    },
    _addPlayer(key, id, session, teamIdx, isOwner) {
      const playerParams = { id, key, teamIdx, isOwner }
      logger.trace(playerParams, "Adding player to match started")
      const exists = lobby.players.find((player) => player.session === session)
      const hasMovedSlots = Boolean(exists)
      if (exists) {
        if (exists.teamIdx === teamIdx) {
          logger.trace(
            playerParams,
            "Adding player to match: Player already exists on the same team"
          )
          return exists
        }
        isOwner = exists.isOwner

        logger.trace(
          playerParams,
          "Adding player to match: Player already exists on a different team, removing player"
        )
        lobby.removePlayer(exists.session as string)
      }

      if (lobby.started) {
        logger.trace(
          playerParams,
          "Adding player to match: Match already started! Cannot add player"
        )
        throw new Error(GAME_ERROR.MATCH_ALREADY_STARTED)
      }

      if (lobby.full) {
        logger.trace(playerParams, "Adding player to match: Lobby is full. Cannot add player")
        throw new Error(GAME_ERROR.LOBBY_IS_FULL)
      }

      const maxSize = teamSize ? teamSize : 3
      if (
        lobby.full ||
        lobby.players.filter((player) => player.teamIdx === teamIdx).length > maxSize
      ) {
        logger.trace(playerParams, "Adding player to match: Team is full. Cannot add player")
        throw new Error(GAME_ERROR.TEAM_IS_FULL)
      }
      const player = Player(
        key,
        id,
        teamIdx !== undefined ? teamIdx : Number(!lobby.lastTeamIdx),
        isOwner
      )

      player.setSession(session)
      lobby.lastTeamIdx = player.teamIdx as 0 | 1

      // Find team available slot
      for (let i = 0; i < lobby._players.length; i++) {
        if (!lobby._players[i].id) {
          if (player.teamIdx === 0 && i % 2 === 0) {
            lobby._players[i] = player
            break
          }
          if (player.teamIdx === 1 && i % 2 !== 0) {
            lobby._players[i] = player
            break
          }
        }
      }

      if (hasMovedSlots) {
        // Reorder other players to fit possible empty slot left by this player
        for (let i = 0; i < lobby._players.length; i++) {
          if (!lobby._players[i].id) {
            for (let j = i + 2; j < lobby._players.length; j = j + 2) {
              if (lobby._players[j].id) {
                const p = { ...lobby._players[j] }
                lobby._players[j] = {}
                lobby._players[i] = p
                break
              }
            }
          }
        }
      }

      lobby.calculateFull()
      lobby.calculateReady()

      logger.trace({ playerParams, player: player.getPublicPlayer() }, "Added player to match")

      return player
    },
    removePlayer(session) {
      const idx = lobby._players.findIndex((player) => player && player.session === session)
      if (idx !== -1) {
        lobby._players[idx] = {}
        lobby.calculateFull()
        lobby.calculateReady()
      }
      return lobby
    },
    startMatch(matchPoint = 9) {
      lobby.calculateReady()
      const actualTeamSize = lobby.players.length / 2

      if (!TEAM_SIZE_VALUES.includes(actualTeamSize)) {
        throw new Error(GAME_ERROR.UNEXPECTED_TEAM_SIZE)
      }

      if (!lobby.ready) {
        throw new Error(GAME_ERROR.TEAM_NOT_READY)
      }

      lobby.teams = [
        Team(lobby.players.filter((player) => player.teamIdx === 0)),
        Team(lobby.players.filter((player) => player.teamIdx === 1)),
      ]

      if (
        lobby.teams[0].players.length !== actualTeamSize ||
        lobby.teams[1].players.length !== actualTeamSize
      ) {
        throw new Error(GAME_ERROR.UNEXPECTED_TEAM_SIZE)
      }

      lobby.table = Table(lobby.players)
      lobby.gameLoop = GameLoop(Match(lobby.table, lobby.teams, matchPoint))

      lobby.started = true
      return lobby.gameLoop
    },
  }

  for (let i = 0; i < lobby.maxPlayers; i++) {
    lobby._players.push({})
  }

  return lobby
}
