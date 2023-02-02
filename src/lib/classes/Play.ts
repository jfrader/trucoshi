import { ECommand, EEnvidoCommand, EHandState, EnvidoState, ESayCommand } from "../../types"
import { ICard } from "./Deck"
import { IHand } from "./Hand"
import { IPlayer } from "./Player"
import { IRound } from "./Round"
import { ITeam } from "./Team"
import { ITruco } from "./Truco"

export interface IPlayInstance {
  teams: [ITeam, ITeam]
  handIdx: number
  roundIdx: number
  state: EHandState
  truco: ITruco
  envido: EnvidoState
  player: IPlayer | null
  commands: Array<ECommand> | null
  rounds: Array<IRound> | null
  use(idx: number, card: ICard): ICard | null
  say(command: ECommand): ECommand | null
}

export function PlayInstance(hand: IHand, teams: [ITeam, ITeam]) {
  const instance: IPlayInstance = {
    state: hand.state,
    teams,
    truco: hand.truco,
    envido: hand.envido,
    handIdx: hand.idx,
    roundIdx: hand.rounds.length,
    player: hand.currentPlayer,
    commands: [],
    rounds: hand.rounds,
    use(idx, card) {
      return hand.use(idx, card)
    },
    say(command) {
      if (!hand._currentPlayer || !instance.commands?.includes(command)) {
        return null
      }

      hand.commands[command](hand._currentPlayer)

      return command
    },
  }

  instance.commands?.push(ESayCommand.MAZO)
  instance.commands?.push(ESayCommand.TRUCO)

  if (hand.rounds.length === 1) {
    instance.commands?.push(EEnvidoCommand.ENVIDO)
  }

  if (hand.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
    instance.commands = [ESayCommand.TRUCO, ESayCommand.QUIERO, ESayCommand.NO_QUIERO]
  }

  return instance
}
