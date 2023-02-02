import { TEAM_SIZE_VALUES } from "../constants"
import { GAME_ERROR } from "../../types"
import { GameLoop, IGameLoop } from "./GameLoop"
import { Match } from "./Match"
import { IPlayer, Player } from "./Player"
import { ITable, Table } from "./Table"
import { ITeam, Team } from "./Team"

export interface IPrivateLobby {
  gameLoop?: IGameLoop
  lastTeamIdx: 0 | 1
  _players: Array<IPlayer | { id?: undefined; session?: undefined }>
  get players(): Array<IPlayer>
  teams: Array<ITeam>
  maxPlayers: number
  table: ITable | null
  full: boolean
  ready: boolean
  started: boolean
  addPlayer(id: string, session: string, teamIdx?: 0 | 1, isOwner?: boolean): IPlayer
  removePlayer(id: string): ILobby
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
    addPlayer(id, session, teamIdx, isOwner) {
      const exists = lobby.players.find((player) => player.session === session)
      if (exists) {
        if (exists.teamIdx === teamIdx) {
          return exists
        }
        lobby.removePlayer(exists.session as string)
      }

      if (lobby.started) {
        throw new Error(GAME_ERROR.MATCH_ALREADY_STARTED)
      }

      if (lobby.full) {
        throw new Error(GAME_ERROR.LOBBY_IS_FULL)
      }

      const maxSize = teamSize ? teamSize : 3
      if (
        lobby.full ||
        lobby.players.filter((player) => player.teamIdx === teamIdx).length > maxSize
      ) {
        throw new Error(GAME_ERROR.TEAM_IS_FULL)
      }
      const player = Player(
        id,
        teamIdx !== undefined ? teamIdx : Number(!lobby.lastTeamIdx),
        isOwner
      )
      player.setSession(session)
      lobby.lastTeamIdx = Number(!lobby.lastTeamIdx) as 0 | 1

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

      lobby.calculateFull()
      lobby.calculateReady()
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

      lobby.table = Table(lobby.players, lobby.teams)
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
