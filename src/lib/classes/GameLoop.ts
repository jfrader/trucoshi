import { EHandState } from "../../types"
import { IHand } from "./Hand"
import { IMatch } from "./Match"
import { IPlayInstance } from "./Play"
import { IPlayer } from "./Player"
import { ITeam } from "./Team"

export type IWinnerCallback = (winner: ITeam, teams: [ITeam, ITeam]) => Promise<void>
export type ITurnCallback = (play: IPlayInstance) => Promise<void>
export type ITrucoCallback = (play: IPlayInstance) => Promise<void>

export interface IGameLoop {
  _onTruco: ITrucoCallback
  _onTurn: ITurnCallback
  _onWinner: IWinnerCallback
  currentPlayer: IPlayer | null
  currentHand: IHand | null
  previousHand: IHand | null
  teams: Array<ITeam>
  winner: ITeam | null
  onTurn: (callback: ITurnCallback) => IGameLoop
  onWinner: (callback: IWinnerCallback) => IGameLoop
  onTruco: (callback: ITrucoCallback) => IGameLoop
  begin: () => Promise<void>
}

export const GameLoop = (match: IMatch) => {
  let gameloop: IGameLoop = {
    _onTruco: () => Promise.resolve(),
    _onTurn: () => Promise.resolve(),
    _onWinner: () => Promise.resolve(),
    teams: [],
    winner: null,
    currentPlayer: null,
    currentHand: null,
    previousHand: null,
    onTruco: (callback: ITrucoCallback) => {
      gameloop._onTruco = callback
      return gameloop
    },
    onTurn: (callback: ITurnCallback) => {
      gameloop._onTurn = callback
      return gameloop
    },
    onWinner: (callback: IWinnerCallback) => {
      gameloop._onWinner = callback
      return gameloop
    },
    async begin() {
      gameloop.teams = match.teams

      while (!match.winner) {
        const play = match.play()

        gameloop.currentHand = match.currentHand

        if (!play || !play.player) {
          continue
        }

        gameloop.currentPlayer = play.player

        if (play.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
          try {
            await gameloop._onTruco(play)
          } catch (e) {
            console.error("GAME LOOP ERROR", e)
          }
          continue
        }

        if (play.state === EHandState.WAITING_PLAY) {
          play.player.setTurn(true)
          try {
            await gameloop._onTurn(play)
          } catch (e) {
            console.error("GAME LOOP ERROR", e)
          }
          gameloop.previousHand = match.prevHand
          play.player.setTurn(false)
          continue
        }
      }

      gameloop.winner = match.winner
      gameloop.currentPlayer = null

      await gameloop._onWinner(match.winner, match.teams)
    },
  }

  return gameloop
}
