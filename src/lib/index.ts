import { Match } from "./classes/Match"
import { Player } from "./classes/Player"
import { Team } from "./classes/Team"
import { ITeam } from "./types"

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
