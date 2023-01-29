import { Lobby } from "../../lib"
import { IPublicPlayer } from "../../lib/classes/Player"
import { IPublicTeam } from "../../lib/classes/Team"
import { ICard, ILobby, IPlayedCard } from "../../lib/types"

export interface IPublicMatch {
  teams: Array<IPublicTeam>
  players: Array<IPublicPlayer>
  hands: Array<Array<Array<IPlayedCard>>>
}

export interface IMatchTable {
  matchSessionId: string
  lobby: ILobby
  state: EMatchTableState
  setState(state: EMatchTableState): void
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
    lobby: Lobby(teamSize),
    state: EMatchTableState.UNREADY,
    setState(state) {
      matchTable.state = state
    },
    getPublicMatch(userSession) {
      console.log(matchTable.lobby.gameLoop)

      return {
        matchSessionId,
        teams: [],
        players: matchTable.lobby.players.map((player) =>
          player.session === userSession
            ? player
            : { ...player, hand: player.hand.map(() => "xx" as ICard) }
        ),
        hands:
          matchTable.lobby.gameLoop?.hands.map((hand) => hand.rounds.map((round) => round.cards)) ||
          [],
      }
    },
  }

  return matchTable
}
