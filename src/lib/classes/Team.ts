import logger from "../../utils/logger"
import { IPlayer, ITeam } from "../../types"

export function Team(id: 0 | 1, players: Array<IPlayer>, name?: string) {
  const team: ITeam = {
    _players: new Map<string, IPlayer>(),
    get players() {
      return Array.from(team._players.values())
    },
    id,
    name: name || (id ? "Ellos" : "Nosotros"),
    points: {
      buenas: 0,
      malas: 0,
      winner: false,
    },
    getPublicTeam(playerSession) {
      return {
        id: team.id,
        name: team.name,
        points: team.points,
        players: team.players.map((player) => player.getPublicPlayer(playerSession)),
      }
    },
    isTeamDisabled() {
      return team.players.every((player) => player.disabled || player.abandoned)
    },
    enable(player) {
      if (player) {
        team._players.get(player.session as string)?.enable()
        return team.isTeamDisabled()
      }
      for (const player of team.players) {
        player.enable()
      }
      return team.isTeamDisabled()
    },
    disable(player) {
      team._players.get(player.session as string)?.disable()
      return team.isTeamDisabled()
    },
    pointsToWin(matchPoint) {
      if (team.points.malas < matchPoint && team.points.buenas < 1) {
        return matchPoint * 2 - team.points.malas
      }
      return matchPoint - team.points.buenas
    },
    addPoints(matchPoint, points, simulate = false) {
      const current = structuredClone(team.points)
      const malas = current.malas + points
      const diff = malas - matchPoint

      if (diff > 0) {
        current.malas = matchPoint
        current.buenas += diff
        if (current.buenas >= matchPoint) {
          current.winner = true
        }
      } else {
        current.malas = malas
      }

      if (simulate) {
        return current
      }

      team.points = current
      return team.points
    },
  }

  players.forEach((player) => team._players.set(player.session as string, player))

  return team
}
