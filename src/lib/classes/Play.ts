import logger from "../../etc/logger"
import { ECommand, EHandState, GAME_ERROR, ICard, IPlayer, ITeam } from "../../types"
import { IEnvido } from "./Envido"
import { IHand } from "./Hand"
import { IRound } from "./Round"
import { ITruco } from "./Truco"

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
  say(command: ECommand | number, player: IPlayer): ECommand | number | null
}

export function PlayInstance(hand: IHand, prevHand: IHand | null, teams: [ITeam, ITeam]) {
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
      return hand.use(idx, card)
    },
    say(command, player) {
      try {
        if (player.disabled) {
          return null
        }
        const fn = hand.say[command as ECommand]
        if (fn) {
          if (!player.commands.includes(command as ECommand)) {
            throw new Error(GAME_ERROR.INVALID_COMAND)
          }
          fn(player)
        } else {
          if (!player.envido.includes(command as number)) {
            throw new Error(GAME_ERROR.INVALID_ENVIDO_POINTS)
          }
          hand.sayEnvidoPoints(player, command as number)
        }
        return command
      } catch (e) {
        logger.error(e)
        return null
      }
    },
  }

  return instance
}
