import { EHandState } from "../../types"
import { IHand } from "./Hand"
import { IMatch } from "./Match"
import { IPlayInstance } from "./Play"
import { IPlayer } from "./Player"
import { ITeam } from "./Team"

export type IWinnerCallback = (winner: ITeam, teams: [ITeam, ITeam]) => Promise<void>
export type ITurnCallback = (play: IPlayInstance, newHandJustStarted: boolean) => Promise<void>
export type ITrucoCallback = (play: IPlayInstance) => Promise<void>
export type IEnvidoCallback = (play: IPlayInstance, pointsRound: boolean) => Promise<void>

export interface IGameLoop {
  _onTruco: ITrucoCallback
  _onTurn: ITurnCallback
  _onWinner: IWinnerCallback
  _onEnvido: IEnvidoCallback
  currentPlayer: IPlayer | null
  currentHand: IHand | null
  lastCheckedHand: number | null
  teams: Array<ITeam>
  winner: ITeam | null
  onTurn: (callback: ITurnCallback) => IGameLoop
  onWinner: (callback: IWinnerCallback) => IGameLoop
  onTruco: (callback: ITrucoCallback) => IGameLoop
  onEnvido: (callback: IEnvidoCallback) => IGameLoop
  begin: () => Promise<void>
}

export const GameLoop = (match: IMatch) => {
  let gameloop: IGameLoop = {
    _onEnvido: () => Promise.resolve(),
    _onTruco: () => Promise.resolve(),
    _onTurn: () => Promise.resolve(),
    _onWinner: () => Promise.resolve(),
    teams: [],
    winner: null,
    currentPlayer: null,
    currentHand: null,
    lastCheckedHand: null,
    onTruco: (callback) => {
      gameloop._onTruco = callback
      return gameloop
    },
    onTurn: (callback) => {
      gameloop._onTurn = callback
      return gameloop
    },
    onWinner: (callback) => {
      gameloop._onWinner = callback
      return gameloop
    },
    onEnvido: (callback) => {
      gameloop._onEnvido = callback
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

        if (play.state === EHandState.WAITING_ENVIDO_ANSWER) {
          try {
            play.player.setTurn(true)
            await gameloop._onEnvido(play, false)
            play.player.setTurn(false)
          } catch (e) {
            console.error("GAME LOOP ERROR - WAITING ENVIDO ANSWER", e)
          }
          continue
        }

        if (play.state === EHandState.WAITING_ENVIDO_POINTS_ANSWER) {
          try {
            play.player.setEnvidoTurn(true)
            await gameloop._onEnvido(play, true)
            play.player.setEnvidoTurn(false)
          } catch (e) {
            console.error("GAME LOOP ERROR - WAITING ENVIDO POINTS ANSWER", e)
          }
          continue
        }

        if (play.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
          try {
            await gameloop._onTruco(play)
          } catch (e) {
            console.error("GAME LOOP ERROR - WAITING TRUCO ANSWER", e)
          }
          continue
        }

        if (play.state === EHandState.WAITING_PLAY) {
          try {
            play.player.setTurn(true)
            const newHandJustStarted = gameloop.lastCheckedHand !== play.prevHand?.idx
            gameloop.lastCheckedHand = play.prevHand ? play.prevHand.idx : null
            await gameloop._onTurn(play, newHandJustStarted)
            play.player.setTurn(false)
          } catch (e) {
            console.error("GAME LOOP ERROR - WAITING PLAY", e)
          }
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
