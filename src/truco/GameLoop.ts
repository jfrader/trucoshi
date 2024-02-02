import logger from "../utils/logger"
import { ECommand, EHandState, ICard, IPlayer, ITeam, ITeamPoints } from "../types"
import { IHand } from "./Hand"
import { IMatch } from "./Match"
import { IPlayInstance } from "./Play"

export type IWinnerCallback = (winner: ITeam, points: [ITeamPoints, ITeamPoints]) => Promise<void>
export type ITurnCallback = (play: IPlayInstance) => Promise<void>
export type ITrucoCallback = (play: IPlayInstance) => Promise<void>
export type IHandFinishedCallback = (hand: IHand | null) => Promise<void>
export type IBeforeHandFinishedCallback = () => Promise<void>
export type IEnvidoCallback = (play: IPlayInstance, pointsRound: boolean) => Promise<void>

const log = logger.child({ class: "Gameloop" })

export interface IGameLoop {
  _onTruco: ITrucoCallback
  _onTurn: ITurnCallback
  _onWinner: IWinnerCallback
  _onEnvido: IEnvidoCallback
  _onHandFinished: IHandFinishedCallback
  _onBeforeHandFinished: IBeforeHandFinishedCallback
  currentPlayer: IPlayer | null
  currentHand: IHand | null
  lastCommand: ECommand | number | null
  lastCard: ICard | null
  teams: Array<ITeam>
  winner: ITeam | null
  onTurn: (callback: ITurnCallback) => IGameLoop
  onWinner: (callback: IWinnerCallback) => IGameLoop
  onTruco: (callback: ITrucoCallback) => IGameLoop
  onEnvido: (callback: IEnvidoCallback) => IGameLoop
  onHandFinished: (callback: IHandFinishedCallback) => IGameLoop
  onBeforeHandFinished: (callback: IBeforeHandFinishedCallback) => IGameLoop
  begin: () => Promise<void>
}

export const GameLoop = (match: IMatch) => {
  let gameloop: IGameLoop = {
    _onEnvido: () => Promise.resolve(),
    _onTruco: () => Promise.resolve(),
    _onTurn: () => Promise.resolve(),
    _onWinner: () => Promise.resolve(),
    _onHandFinished: () => Promise.resolve(),
    _onBeforeHandFinished: () => Promise.resolve(),
    teams: [],
    winner: null,
    currentPlayer: null,
    currentHand: null,
    lastCard: null,
    lastCommand: null,
    onHandFinished: (callback) => {
      gameloop._onHandFinished = callback
      return gameloop
    },
    onBeforeHandFinished: (callback) => {
      gameloop._onBeforeHandFinished = callback
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
      log.trace(
        {
          matchId: match.id,
        },
        "New match gameloop started"
      )

      let winner: ITeam | null = null
      gameloop.teams = match.teams

      while (!match.winner) {
        for (const player of match.table.players) {
          player.setTurn(false)
        }

        const play = match.play()

        gameloop.currentHand = match.currentHand

        try {
          if (!play && match.prevHand) {
            await gameloop._onHandFinished(match.prevHand)
            continue
          }

          if (!play) {
            continue
          }

          gameloop.lastCard = play.lastCard
          gameloop.lastCommand = play.lastCommand
          gameloop.currentPlayer = play.player

          if (play.state === EHandState.BEFORE_FINISHED) {
            await gameloop._onBeforeHandFinished()
            continue
          }

          if (!play.player) {
            continue
          }

          log.trace(
            {
              matchId: match.id,
              state: play.state,
              player: play.player.name,
            },
            "Game new turn started"
          )

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
        } catch (e) {
          log.error(e)
          log.fatal(e, "Match ended because an error was thrown in the game loop!")
          match.setWinner(match.teams[0])
          winner = match.teams[0]
        }

        break
      }

      if (!match.winner) {
        throw new Error("Something went very wrong in the game loop")
      }

      winner = match.winner

      log.debug(
        { matchId: match.id, winnerIdx: winner.id, points: winner.points },
        "Gameloop match found a winner!"
      )

      gameloop.winner = winner
      gameloop.currentPlayer = null

      try {
        await gameloop._onWinner(
          winner,
          match.teams.reduce(
            (prev, curr, idx) => {
              prev[idx] = curr.points
              return prev
            },
            [
              { malas: 0, buenas: 0, winner: false },
              { malas: 0, buenas: 0, winner: false },
            ] as [ITeamPoints, ITeamPoints]
          )
        )
      } catch (e) {
        log.error(e, "Gameloop onWinner callback error")
      }
    },
  }

  return gameloop
}
