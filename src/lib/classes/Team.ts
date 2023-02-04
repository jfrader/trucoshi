import { IPlayer, IPublicPlayer } from "./Player"

export interface ITeam {
  _players: Map<string, IPlayer>
  players: Array<IPlayer>
  points: ITeamPoints
  getPublicTeam(playerSession?: string): IPublicTeam
  isTeamDisabled(): boolean
  disable(player: IPlayer): boolean
  enable(player?: IPlayer): boolean
  addPoints(matchPoint: number, points: number): ITeamPoints
}

export type IPublicTeam = Pick<ITeam, "points"> & { players: Array<IPublicPlayer> }

export interface ITeamPoints {
  buenas: number
  malas: number
  winner: boolean
}

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
        points: team.points,
        players: team.players.map((player) =>
          player.session === playerSession ? player : player.getPublicPlayer()
        ),
      }
    },
    isTeamDisabled() {
      return team.players.reduce((prev, curr) => prev && curr.disabled, true)
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
