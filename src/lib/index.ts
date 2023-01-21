import { Match } from "./classes/Match"
import { Player } from "./classes/Player"
import { Team } from "./classes/Team"
import { IMatch, IPlayInstance, ITeam } from "./types"

const GameLoop = (match: IMatch) => async (onTurn: (match: IPlayInstance) => Promise<void>, onWinner: (winner: ITeam) => Promise<void>) => {
  while(!match.winner) {
    const play = match.play()

    if (!play || !play.player) {
      continue
    }

    await onTurn(play)
  }
  
  await onWinner(match.winner)
}

export function Trucoshi(
  idsTeam0: Array<string>,
  idsTeam1: Array<string>,
  matchPoint: 9 | 12 | 15
) {
  const teams = [
    Team(idsTeam0.map((id) => Player(id, 0))),
    Team(idsTeam1.map((id) => Player(id, 1))),
  ]
  return Match(teams, matchPoint)
}

export function Trucoshi2(
  idsTeam0: Array<string>,
  idsTeam1: Array<string>,
  matchPoint: 9 | 12 | 15
) {
  const teams = [
    Team(idsTeam0.map((id) => Player(id, 0))),
    Team(idsTeam1.map((id) => Player(id, 1))),
  ]
  return GameLoop(Match(teams, matchPoint))
}
