import logger from "../utils/logger"
import { ECommand, EHandState, ICard, IPlayer, ITeam, ITeamPoints } from "../types"
import { IHand } from "./Hand"
import { IMatch } from "./Match"
import { IPlayInstance } from "./Play"

export type IWinnerCallback = (winner: ITeam, points: [ITeamPoints, ITeamPoints]) => Promise<void>
export type ITurnCallback = (play: IPlayInstance) => Promise<void>
export type ITrucoCallback = (play: IPlayInstance) => Promise<void>
export type IHandFinishedCallback = (previousHand: IHand | null) => Promise<void>
export type IBeforeHandFinishedCallback = () => Promise<void>
export type IEnvidoCallback = (play: IPlayInstance, pointsRound: boolean) => Promise<void>
export type IFlorCallback = (play: IPlayInstance) => Promise<void>
export type IFlorBattleCallback = (play: IPlayInstance, hand: IHand | null) => Promise<void>

const log = logger.child({ class: "Gameloop" })

export interface IGameLoop {
  _onTruco: ITrucoCallback
  _onTurn: ITurnCallback
  _onBotTurn: ITurnCallback
  _onWinner: IWinnerCallback
  _onEnvido: IEnvidoCallback
  _onFlor: IFlorCallback
  _onFlorBattle: IFlorBattleCallback
  _onHandFinished: IHandFinishedCallback
  currentPlayer: IPlayer | null
  currentHand: IHand | null
  lastCommand: ECommand | number | null
  lastCard: ICard | null
  teams: Array<ITeam>
  winner: ITeam | null
  onTurn: (callback: ITurnCallback) => IGameLoop
  onBotTurn: (callback: ITurnCallback) => IGameLoop
  onWinner: (callback: IWinnerCallback) => IGameLoop
  onTruco: (callback: ITrucoCallback) => IGameLoop
  onEnvido: (callback: IEnvidoCallback) => IGameLoop
  onFlor: (callback: IFlorCallback) => IGameLoop
  onFlorBattle: (callback: IFlorBattleCallback) => IGameLoop
  onHandFinished: (callback: IHandFinishedCallback) => IGameLoop
  begin: () => Promise<void>
}

export const GameLoop = (match: IMatch) => {
  let gameloop: IGameLoop = {
    _onEnvido: () => Promise.resolve(),
    _onFlor: () => Promise.resolve(),
    _onFlorBattle: () => Promise.resolve(),
    _onTruco: () => Promise.resolve(),
    _onTurn: () => Promise.resolve(),
    _onBotTurn: () => Promise.resolve(),
    _onWinner: () => Promise.resolve(),
    _onHandFinished: () => Promise.resolve(),
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
    onTruco: (callback) => {
      gameloop._onTruco = callback
      return gameloop
    },
    onTurn: (callback) => {
      gameloop._onTurn = callback
      return gameloop
    },
    onBotTurn(callback) {
      gameloop._onBotTurn = callback
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
    onFlor: (callback) => {
      gameloop._onFlor = callback
      return gameloop
    },
    onFlorBattle: (callback) => {
      gameloop._onFlorBattle = callback
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

        try {
          const play = await match.play()

          gameloop.currentHand = match.currentHand

          if (!play) {
            continue
          }

          gameloop.lastCard = play.lastCard
          gameloop.lastCommand = play.lastCommand
          gameloop.currentPlayer = play.player

          if (play.state === EHandState.DISPLAY_FLOR_BATTLE) {
            await gameloop._onFlorBattle(play, match.currentHand)
            continue
          }

          if (play.state === EHandState.DISPLAY_PREVIOUS_HAND) {
            await gameloop._onHandFinished(match.currentHand)
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
              rounds: play.getHand()?.roundsLog,
            },
            "Game new turn started"
          )

          if (play.player.bot) {
            play.player.setTurn(true)
            await gameloop._onBotTurn(play)
            play.player.setTurn(false)
            continue
          }

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

          if (play.state === EHandState.WAITING_FLOR_ANSWER) {
            play.player.setTurn(true)
            await gameloop._onFlor(play)
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
        log.fatal("No winner found in game loop, forcing termination")
        match.setWinner(match.teams[0])
        winner = match.teams[0]
      }

      winner = match.winner!

      log.trace(
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
        console.error(e)
        log.fatal(e, "Gameloop onWinner callback error!!!")
      }
    },
  }

  return gameloop
}
