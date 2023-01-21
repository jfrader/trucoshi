import { IPlayer, ITeam } from "../types"

export function Team(players: Array<IPlayer>) {
  const team: ITeam = {
    _players: new Map<string, IPlayer>(),
    get players() {
      return Array.from(team._players.values())
    },
    points: {
      buenas: 0,
      malas: 0,
      winner: false,
    },
    addPoints(matchPoint, points) {
      const malas = team.points.malas + points
      const diff = malas - matchPoint
      if (diff > 0) {
        team.points.malas = matchPoint
        team.points.buenas += diff
        if (team.points.buenas >= matchPoint) {
          team.points.winner = true
        }
      } else {
        team.points.malas = malas
      }

      return team.points
    },
  }

  players.forEach((player) => team._players.set(player.id, player))

  return team
}
