import { ILobby, IPlayer, IPublicPlayer, Lobby } from "../../lib"
import { EMatchTableState, IPublicMatch } from "../../types"

export interface IMatchTable {
  ownerSession: string
  matchSessionId: string
  currentPlayer: IPublicPlayer | null
  lobby: ILobby
  state(): EMatchTableState
  setCurrentPlayer(player: IPublicPlayer): void
  isSessionPlaying(session: string): IPublicPlayer | null
  getPublicMatch(session?: string): IPublicMatch
  getPublicMatchInfo(): IPublicMatchInfo
}

export interface IPublicMatchInfo {
  matchSessionId: string
  players: number
  maxPlayers: number
  state: EMatchTableState
}

export function MatchTable(matchSessionId: string, ownerSession: string, teamSize?: 1 | 2 | 3) {
  const matchTable: IMatchTable = {
    ownerSession,
    matchSessionId,
    currentPlayer: null,
    lobby: Lobby(teamSize),
    state() {
      matchTable.lobby.calculateReady()
      if (matchTable.lobby.gameLoop?.winner) {
        return EMatchTableState.FINISHED
      }
      if (matchTable.lobby.started) {
        return EMatchTableState.STARTED
      }
      if (matchTable.lobby.ready) {
        return EMatchTableState.READY
      }
      return EMatchTableState.UNREADY
    },
    setCurrentPlayer(player) {
      matchTable.currentPlayer = player
    },
    isSessionPlaying(session) {
      const { lobby } = matchTable
      const search = lobby.players.find((player) => player && player.session === session)
      return search || null
    },
    getPublicMatchInfo() {
      const {
        matchSessionId,
        state,
        lobby: { players, maxPlayers },
      } = matchTable
      return {
        matchSessionId,
        maxPlayers,
        players: players.length,
        state: state(),
      }
    },
    getPublicMatch(userSession) {
      const { lobby } = matchTable

      const winner = lobby.gameLoop?.winner || null

      const lastHandIdx = (lobby.gameLoop?.hands.length || 1) - 1
      const rounds = lobby.gameLoop?.hands[lastHandIdx]?.rounds.map((round) => round.cards) || []

      const prevHandIdx = lastHandIdx - 1

      const hasPrevHand = prevHandIdx !== -1

      const newHandNotStarted = rounds[0]?.length === 0

      const prevRounds =
        hasPrevHand && newHandNotStarted
          ? lobby.gameLoop?.hands[prevHandIdx]?.rounds.map((round) => round.cards)
          : null

      const prevHandPoints = prevRounds && lobby.gameLoop?.hands[prevHandIdx]?.points

      const players = lobby.players.filter((player) => Boolean(player)) as IPlayer[]

      const currentPlayerIdx = players.findIndex(
        (player) => player && player.session === userSession
      )

      const me = players[currentPlayerIdx]

      const cut = players.slice(currentPlayerIdx, players.length)
      const end = players.slice(0, currentPlayerIdx)

      const publicPlayers = cut
        .concat(end)
        .map((player) => (player?.session === userSession ? player : player.getPublicPlayer()))

      const teams = lobby.gameLoop?.teams || lobby.teams
      const publicTeams = teams.map((team) => team.getPublicTeam(userSession))

      return {
        me,
        winner,
        matchSessionId: matchTable.matchSessionId,
        state: matchTable.state(),
        teams: publicTeams,
        players: publicPlayers,
        rounds: rounds || [[]],
        prevRounds: prevRounds || null,
        prevHandPoints,
      }
    },
  }

  return matchTable
}
