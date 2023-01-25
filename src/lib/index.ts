import { Match } from "./classes/Match"
import { Player } from "./classes/Player"
import { Table } from "./classes/Table"
import { Team } from "./classes/Team"
import { GAME_ERROR, TEAM_SIZE_VALUES } from "./constants"
import { EHandState, IMatch, IPlayInstance, IPrivateTrucoshi, ITeam, ITrucoshi } from "./types"

export type IWinnerCallback = (winner: ITeam, teams: [ITeam, ITeam]) => Promise<void>
export type ITurnCallback = (play: IPlayInstance) => Promise<void>
export type ITrucoCallback = (play: IPlayInstance) => Promise<void>

export interface IGameLoop {
  _onTruco: ITrucoCallback
  _onTurn: ITurnCallback
  _onWinner: IWinnerCallback
  onTurn: (callback: ITurnCallback) => IGameLoop
  onWinner: (callback: IWinnerCallback) => IGameLoop
  onTruco: (callback: ITrucoCallback) => IGameLoop
  begin: () => void
}

const GameLoop = (match: IMatch) => {
  let gameloop: IGameLoop = {
    _onTruco: () => Promise.resolve(),
    _onTurn: () => Promise.resolve(),
    _onWinner: () => Promise.resolve(),
    onTruco: (callback: ITrucoCallback) => {
      gameloop._onTruco = callback
      return gameloop
    },
    onTurn: (callback: ITurnCallback) => {
      gameloop._onTurn = callback
      return gameloop
    },
    onWinner: (callback: IWinnerCallback) => {
      gameloop._onWinner = callback
      return gameloop
    },
    async begin() {
      while (!match.winner) {
        const play = match.play()

        if (!play || !play.player) {
          continue
        }

        if (play.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
          await gameloop._onTruco(play)
          continue
        }

        if (play.state === EHandState.WAITING_PLAY) {
          await gameloop._onTurn(play)
          continue
        }
      }

      await gameloop._onWinner(match.winner, match.teams)
    },
  }

  return gameloop
}

export function Trucoshi(teamSize?: 1 | 2 | 3) {
  const trucoshi: IPrivateTrucoshi = {
    lastTeamIdx: 1,
    _players: new Map(),
    get players() {
      return Array.from(trucoshi._players.values())
    },
    teams: [],
    table: null,
    maxPlayers: teamSize ? teamSize * 2 : 6,
    full: false,
    ready: false,
    calculateReady() {
      trucoshi.ready = trucoshi.players.reduce((prev, curr) => prev && curr.ready, true)
      return trucoshi.ready
    },
    calculateFull() {
      trucoshi.full = trucoshi._players.size >= trucoshi.maxPlayers
      return trucoshi.full
    },
    addPlayer(id, teamIdx) {
      const maxSize = teamSize ? teamSize : 3
      if (trucoshi.full || trucoshi.players.filter((p) => p.teamIdx === teamIdx).length > maxSize) {
        throw new Error(GAME_ERROR.TEAM_IS_FULL)
      }
      const player = Player(id, teamIdx !== undefined ? teamIdx : Number(!trucoshi.lastTeamIdx))
      trucoshi.lastTeamIdx = Number(!trucoshi.lastTeamIdx) as 0 | 1
      trucoshi._players.set(id, player)
      trucoshi.calculateFull()
      trucoshi.calculateReady()
      return player
    },
    removePlayer(id) {
      trucoshi._players.delete(id)
      trucoshi.calculateFull()
      trucoshi.calculateReady()
      return trucoshi
    },
    startMatch(matchPoint = 9) {
      trucoshi.calculateReady()
      const teamSize = trucoshi._players.size / 2

      if (!TEAM_SIZE_VALUES.includes(teamSize)) {
        throw new Error(GAME_ERROR.UNEXPECTED_TEAM_SIZE)
      }

      if (!trucoshi.ready) {
        throw new Error(GAME_ERROR.TEAM_NOT_READY)
      }

      trucoshi.teams.push(Team(trucoshi.players.filter((p) => p.teamIdx === 0)))
      trucoshi.teams.push(Team(trucoshi.players.filter((p) => p.teamIdx === 1)))

      if (
        trucoshi.teams[0].players.length !== teamSize ||
        trucoshi.teams[1].players.length !== teamSize
      ) {
        throw new Error(GAME_ERROR.UNEXPECTED_TEAM_SIZE)
      }

      trucoshi.table = Table(trucoshi.players, trucoshi.teams)
      return GameLoop(Match(trucoshi.table, trucoshi.teams, matchPoint))
    },
  }

  return {
    addPlayer: trucoshi.addPlayer,
    removePlayer: trucoshi.removePlayer,
    startMatch: trucoshi.startMatch,
  }
}
