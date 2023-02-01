import { IPlayer, ITeam } from "../types"

export type IPublicTeam = Pick<ITeam, "players" | "points">

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
    getPublicTeam(playerSession) {
      return {
        ...team,
        players: team.players.map((player) =>
          player.session === playerSession ? player : player.getPublicPlayer()
        ),
      }
    },
    isTeamDisabled() {
      return team.players.reduce((prev, curr) => prev && curr.disabled, true)
    },
    disable(player) {
      team._players.get(player.session as string)?.disable()
      return team.isTeamDisabled()
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

  players.forEach((player) => team._players.set(player.session as string, player))

  return team
}
