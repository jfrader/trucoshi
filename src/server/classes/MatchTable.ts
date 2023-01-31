import { Lobby } from "../../lib"
import { IPublicPlayer } from "../../lib/classes/Player"
import { IPublicTeam } from "../../lib/classes/Team"
import { ICard, ILobby, IPlayedCard } from "../../lib/types"

export interface IPublicMatch {
  matchSessionId: string
  teams: Array<IPublicTeam>
  players: Array<IPublicPlayer>
  rounds: IPlayedCard[][]
  state: EMatchTableState
}

export interface IMatchTable {
  matchSessionId: string
  currentPlayer: IPublicPlayer | null
  lobby: ILobby
  state: EMatchTableState
  setState(state: EMatchTableState): void
  setCurrentPlayer(player: IPublicPlayer): void
  isSessionPlaying(session: string): IPublicPlayer | null
  getPublicMatch(session?: string): IPublicMatch
}

export enum EMatchTableState {
  UNREADY,
  STARTED,
  FINISHED,
}

export function MatchTable(matchSessionId: string, teamSize?: 1 | 2 | 3) {
  const matchTable: IMatchTable = {
    matchSessionId,
    currentPlayer: null,
    lobby: Lobby(teamSize),
    state: EMatchTableState.UNREADY,
    setState(state) {
      matchTable.state = state
    },
    setCurrentPlayer(player) {
      matchTable.currentPlayer = player
    },
    isSessionPlaying(session) {
      const { lobby } = matchTable
      const search = lobby.players.find((player) => player.session === session)
      return search || null
    },
    getPublicMatch(userSession) {
      const { lobby } = matchTable

      const lastHand = (lobby.gameLoop?.hands.length || 1) - 1
      const rounds = lobby.gameLoop?.hands[lastHand]?.rounds.map((round) => round.cards)

      return {
        matchSessionId: matchTable.matchSessionId,
        state: matchTable.state,
        teams: [],
        players: lobby.players.map((player) =>
          player.session === userSession
            ? player
            : { ...player, hand: player.hand.map(() => "xx" as ICard) }
        ),
        rounds: rounds || [[]],
      }
    },
  }

  return matchTable
}
