import { Match } from "./classes/Match"
import { Player } from "./classes/Player"
import { Team } from "./classes/Team"
import { IMatch, IPlayInstance, ITeam } from "./types"

export type IWinnerCallback = (winner: ITeam, teams: [ITeam, ITeam]) => Promise<void>
export type ITurnCallback = (match: IPlayInstance) => Promise<void>

export interface IGameLoop {
  _onTurn: (match: IPlayInstance) => Promise<void>
  _onWinner: (winner: ITeam, teams: [ITeam, ITeam]) => Promise<void>
  onTurn: (callback: ITurnCallback) => IGameLoop
  onWinner: (callback: IWinnerCallback) => IGameLoop
  start: () => void
}

const GameLoop = (match: IMatch) => {
  let gameloop: IGameLoop = {
    _onTurn: () => Promise.resolve(),
    _onWinner: () => Promise.resolve(),
    onTurn: (callback: ITurnCallback) => {
      gameloop._onTurn = callback
      return gameloop
    },
    onWinner: (callback: IWinnerCallback) => {
      gameloop._onWinner = callback
      return gameloop
    },
    async start() {
      while (!match.winner) {
        const play = match.play()

        if (!play || !play.player) {
          continue
        }

        await gameloop._onTurn(play)
      }

      await gameloop._onWinner(match.winner, match.teams)
    },
  }

  return gameloop
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
