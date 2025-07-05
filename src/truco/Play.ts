import logger from "../utils/logger"
import { ECommand, EHandState, ESayCommand, GAME_ERROR, ICard, IPlayer, ITeam } from "../types"
import { IEnvido } from "./Envido"
import { IHand } from "./Hand"
import { IRound } from "./Round"
import { ITruco } from "./Truco"

const log = logger.child({ class: "Play" })

type PlayArgs<TType> = TType extends (...args: infer U extends any[]) => any ? U : never
type PlayReturn<TType> = (TType extends (...args: any[]) => infer U ? U : never) | null

export interface IPlayInstance {
  teams: [ITeam, ITeam]
  handIdx: number
  roundIdx: number
  state: EHandState
  truco: ITruco
  envido: IEnvido
  player: IPlayer | null
  rounds: Array<IRound> | null
  prevHand: IHand | null
  freshHand: boolean
  waitingPlay: boolean
  lastCommand: ECommand | number | null
  lastCard: ICard | null
  getHand(): IHand
  setWaiting(waiting: boolean): void
  use(idx: number, card: ICard): ICard | null
  say(command: ECommand | number, player: IPlayer, force?: boolean): typeof command | null
}

export function PlayInstance(hand: IHand, prevHand: IHand | null, teams: [ITeam, ITeam]) {
  function play<TFnType extends ((...args: any[]) => any) | undefined>(
    fn?: TFnType,
    ...args: PlayArgs<TFnType>
  ): PlayReturn<TFnType> {
    if (!fn) {
      return null
    }
    const result = fn(...args)
    if (result !== null) {
      instance.setWaiting(false)
      return result
    }
    return null
  }

  let busy = false

  const instance: IPlayInstance = {
    state: hand.state,
    teams,
    waitingPlay: Boolean(hand.currentPlayer),
    truco: hand.truco,
    envido: hand.envido,
    handIdx: hand.idx,
    roundIdx: hand.rounds.length,
    player: hand.currentPlayer,
    rounds: hand.rounds,
    prevHand: prevHand && !hand.started ? prevHand : null,
    freshHand: !hand.started,
    lastCard: null,
    lastCommand: null,
    setWaiting(waiting) {
      instance.waitingPlay = waiting
    },
    getHand() {
      return hand
    },
    use(idx, card) {
      if (busy) {
        return play()
      }
      busy = true

      log.trace(
        { card, player: hand.currentPlayer?.name, hand: hand.currentPlayer?.hand },
        "Playing card"
      )

      const result = play(hand.use, idx, card)
      if (result) {
        instance.lastCard = result
      }
      return result
    },
    say(command, player, force) {
      if (busy) {
        return play()
      }
      busy = true

      log.trace(
        { command, player: player.name, envido: player.envido, commands: player.commands },
        "Saying command"
      )

      try {
        if (player.disabled && !force) {
          return play()
        }

        if (typeof command === "number") {
          if (command !== 0 && !player.envido.map((e) => e.value).includes(command as number)) {
            throw new Error(GAME_ERROR.INVALID_ENVIDO_POINTS)
          }

          const result = play(hand.sayEnvidoPoints, player, command)
          if (result) {
            instance.lastCommand = result
          }
          return result
        }

        if (!player.commands.includes(command as ECommand) && !force) {
          throw new Error(GAME_ERROR.INVALID_COMAND)
        }
        const result = play(hand.say, command, player)
        if (result) {
          instance.lastCommand = result
        }
        return result
      } catch (e) {
        log.error(e, "Error trying to say command " + command)
        return null
      }
    },
  }

  return instance
}
