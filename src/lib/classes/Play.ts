import logger from "../../utils/logger"
import { ECommand, EHandState, GAME_ERROR, ICard, IPlayer, ITeam } from "../../types"
import { IEnvido } from "./Envido"
import { IHand } from "./Hand"
import { IRound } from "./Round"
import { ITruco } from "./Truco"

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
  waitingPlay: boolean
  setWaiting(waiting: boolean): void
  use(idx: number, card: ICard): ICard | null
  say(command: ECommand | number, player: IPlayer): typeof command | null
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
    prevHand: prevHand && !hand.started && !hand.truco.waitingAnswer ? prevHand : null,
    setWaiting(waiting) {
      instance.waitingPlay = waiting
    },
    use(idx, card) {
      return play(hand.use, idx, card)
    },
    say(command, player) {
      try {
        if (player.disabled) {
          return play()
        }

        if (typeof command === "number") {
          if (command !== 0 && !player.envido.includes(command as number)) {
            throw new Error(GAME_ERROR.INVALID_ENVIDO_POINTS)
          }

          return play(hand.sayEnvidoPoints, player, command)
        }

        if (!player.commands.includes(command as ECommand)) {
          throw new Error(GAME_ERROR.INVALID_COMAND)
        }
        return play(hand.say, command, player)
      } catch (e) {
        logger.error(e)
        return null
      }
    },
  }

  return instance
}
