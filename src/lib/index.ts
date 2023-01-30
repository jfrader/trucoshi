import { Match } from "./classes/Match"
import { Player } from "./classes/Player"
import { Table } from "./classes/Table"
import { Team } from "./classes/Team"
import { GAME_ERROR, TEAM_SIZE_VALUES } from "./constants"
import { EHandState, IHand, IMatch, IPlayInstance, IPrivateLobby, ITeam, ILobby } from "./types"

export type IWinnerCallback = (winner: ITeam, teams: [ITeam, ITeam]) => Promise<void>
export type ITurnCallback = (play: IPlayInstance) => Promise<void>
export type ITrucoCallback = (play: IPlayInstance) => Promise<void>

export interface IGameLoop {
  _onTruco: ITrucoCallback
  _onTurn: ITurnCallback
  _onWinner: IWinnerCallback
  teams: Array<ITeam>
  hands: Array<IHand>
  onTurn: (callback: ITurnCallback) => IGameLoop
  onWinner: (callback: IWinnerCallback) => IGameLoop
  onTruco: (callback: ITrucoCallback) => IGameLoop
  begin: () => Promise<void>
}

const GameLoop = (match: IMatch) => {
  let gameloop: IGameLoop = {
    _onTruco: () => Promise.resolve(),
    _onTurn: () => Promise.resolve(),
    _onWinner: () => Promise.resolve(),
    teams: [],
    hands: [],
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
      gameloop.teams = match.teams

      while (!match.winner) {
        const play = match.play()

        gameloop.hands = match.hands

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

export function Lobby(teamSize?: 1 | 2 | 3): ILobby {
  const lobby: IPrivateLobby = {
    lastTeamIdx: 1,
    _players: new Map(),
    get players() {
      return Array.from(lobby._players.values())
    },
    teams: [],
    table: null,
    maxPlayers: teamSize ? teamSize * 2 : 6,
    full: false,
    ready: false,
    gameLoop: undefined,
    calculateReady() {
      lobby.ready = lobby.players.reduce((prev, curr) => prev && curr.ready, true)
      return lobby.ready
    },
    calculateFull() {
      lobby.full = lobby._players.size >= lobby.maxPlayers
      return lobby.full
    },
    addPlayer(id, session, teamIdx) {
      const maxSize = teamSize ? teamSize : 3
      if (lobby.full || lobby.players.filter((p) => p.teamIdx === teamIdx).length > maxSize) {
        throw new Error(GAME_ERROR.TEAM_IS_FULL)
      }
      const player = Player(id, teamIdx !== undefined ? teamIdx : Number(!lobby.lastTeamIdx))
      player.setSession(session)
      lobby.lastTeamIdx = Number(!lobby.lastTeamIdx) as 0 | 1
      lobby._players.set(id, player)
      lobby.calculateFull()
      lobby.calculateReady()
      return player
    },
    removePlayer(id) {
      lobby._players.delete(id)
      lobby.calculateFull()
      lobby.calculateReady()
      return lobby
    },
    startMatch(matchPoint = 9) {
      lobby.calculateReady()
      const teamSize = lobby._players.size / 2

      if (!TEAM_SIZE_VALUES.includes(teamSize)) {
        throw new Error(GAME_ERROR.UNEXPECTED_TEAM_SIZE)
      }

      if (!lobby.ready) {
        throw new Error(GAME_ERROR.TEAM_NOT_READY)
      }

      lobby.teams = [
        Team(lobby.players.filter((p) => p.teamIdx === 0)),
        Team(lobby.players.filter((p) => p.teamIdx === 1)),
      ]

      if (
        lobby.teams[0].players.length !== teamSize ||
        lobby.teams[1].players.length !== teamSize
      ) {
        throw new Error(GAME_ERROR.UNEXPECTED_TEAM_SIZE)
      }

      lobby.table = Table(lobby.players, lobby.teams)
      lobby.gameLoop = GameLoop(Match(lobby.table, lobby.teams, matchPoint))
      return lobby.gameLoop
    },
  }

  return lobby
}
