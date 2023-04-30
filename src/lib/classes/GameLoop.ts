import logger from "../../etc/logger"
import {
  EHandState,
  IPlayer,
  ITeam,
} from "../../types"
import { IHand } from "./Hand"
import { IMatch } from "./Match"
import { IPlayInstance } from "./Play"

export type IWinnerCallback = (winner: ITeam, teams: [ITeam, ITeam]) => Promise<void>
export type ITurnCallback = (play: IPlayInstance) => Promise<void>
export type ITrucoCallback = (play: IPlayInstance) => Promise<void>
export type IHandFinishedCallback = (hand: IHand | null) => Promise<void>
export type IEnvidoCallback = (play: IPlayInstance, pointsRound: boolean) => Promise<void>

export interface IGameLoop {
  _onTruco: ITrucoCallback
  _onTurn: ITurnCallback
  _onWinner: IWinnerCallback
  _onEnvido: IEnvidoCallback
  _onHandFinished: IHandFinishedCallback
  currentPlayer: IPlayer | null
  currentHand: IHand | null
  teams: Array<ITeam>
  winner: ITeam | null
  onTurn: (callback: ITurnCallback) => IGameLoop
  onWinner: (callback: IWinnerCallback) => IGameLoop
  onTruco: (callback: ITrucoCallback) => IGameLoop
  onEnvido: (callback: IEnvidoCallback) => IGameLoop
  onHandFinished: (callback: IHandFinishedCallback) => IGameLoop
  begin: () => Promise<void>
}

export const GameLoop = (match: IMatch) => {
  let gameloop: IGameLoop = {
    _onEnvido: () => Promise.resolve(),
    _onTruco: () => Promise.resolve(),
    _onTurn: () => Promise.resolve(),
    _onWinner: () => Promise.resolve(),
    _onHandFinished: () => Promise.resolve(),
    teams: [],
    winner: null,
    currentPlayer: null,
    currentHand: null,
    onHandFinished: (callback) => {
      gameloop._onHandFinished = callback
      return gameloop
    },
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
      let winner: ITeam | null = null
      try {
        gameloop.teams = match.teams

        while (!match.winner) {
          const play = match.play()

          logger.trace({ winner: match.winner }, "Game tick started")

          gameloop.currentHand = match.currentHand

          if (!play && match.prevHand) {
            await gameloop._onHandFinished(match.prevHand)
            continue
          }

          if (!play || !play.player) {
            continue
          }

          gameloop.currentPlayer = play.player

          if (play.state === EHandState.WAITING_ENVIDO_ANSWER) {
            play.player.setTurn(true)
            await gameloop._onEnvido(play, false)
            play.player.setTurn(false)
            continue
          }

          if (play.state === EHandState.WAITING_ENVIDO_POINTS_ANSWER) {
            play.player.setTurn(true)
            play.player.setEnvidoTurn(true)
            await gameloop._onEnvido(play, true)
            play.player.setEnvidoTurn(false)
            play.player.setTurn(false)
            continue
          }

          if (play.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
            play.player.setTurn(true)
            await gameloop._onTruco(play)
            play.player.setTurn(false)
            continue
          }

          if (play.state === EHandState.WAITING_PLAY) {
            play.player.setTurn(true)
            await gameloop._onTurn(play)
            play.player.setTurn(false)
            continue
          }

          break
        }

        if (!match.winner) {
          throw new Error("Something went very wrong in the game loop")
        }

        winner = match.winner
      } catch (e) {
        logger.error(e)
        logger.fatal(e, "Match ended because an error was thrown in the game loop!")
        match.setWinner(match.teams[0])
        winner = match.teams[0]
      }

      gameloop.winner = winner
      gameloop.currentPlayer = null

      try {
        await gameloop._onWinner(winner, match.teams)
      } catch (e) {
        logger.error(e, "Gameloop onWinner callback error")
      }
    },
  }

  return gameloop
}
