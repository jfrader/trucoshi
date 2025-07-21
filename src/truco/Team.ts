import { IPlayer, ITeam } from "../types"

export function Team(id: 0 | 1, name?: string) {
  const team: ITeam = {
    _players: new Map<string, IPlayer>(),
    get players() {
      return Array.from(team._players.values())
    },
    get activePlayers() {
      return Array.from(team._players.values()).filter((p) => !p.disabled)
    },
    id,
    name: name || (id ? "Ellos" : "Nosotros"),
    points: {
      buenas: 0,
      malas: 0,
      winner: false,
    },
    setPlayers(players) {
      team._players.clear()
      players.forEach((player) => team._players.set(player.session as string, player))
      return team
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
    isTeamAbandoned() {
      return team.players.every((player) => player.abandoned)
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
      team._players.get(player.session)?.disable()
      return team.isTeamDisabled()
    },
    abandon(player) {
      team._players.get(player.session)?.abandon()
      return team.isTeamAbandoned()
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

  return team
}
