import { IPlayInstance } from "../truco"
import {
  ECommand,
  EEnvidoAnswerCommand,
  EEnvidoCommand,
  EFlorCommand,
  EHandState,
  ESayCommand,
  ICard,
  IPlayer,
} from "../types"

export function getCommandSound({
  state,
  command,
  player,
}: {
  state: EHandState
  command: ECommand | number
  player: IPlayer
}) {
  if (command === EEnvidoAnswerCommand.SON_BUENAS || command === ESayCommand.PASO) {
    return "miss"
  }

  if (state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
    if (
      Object.values(EEnvidoCommand).includes(command as EEnvidoCommand) ||
      Object.values(EFlorCommand).includes(command as EFlorCommand)
    )
      return player.bot ? "bot" : "hit"
  }

  if (state === EHandState.WAITING_ENVIDO_ANSWER && command === EFlorCommand.FLOR) {
    if (Math.random() < 0.35) {
      return "toasty"
    }
    return player.bot ? "bot" : "kiss"
  }

  if (player.bot && command === EFlorCommand.CONTRAFLOR_AL_RESTO) {
    return "botvoice"
  }

  if (command === EFlorCommand.ACHICO) {
    return "mate"
  }

  return "chat"
}

export function getCardSound({ card, play }: { card: ICard; play: IPlayInstance }) {
  if (play.roundIdx === 3 || play.rounds?.[play.roundIdx - 2]?.tie) {
    if (card === "1e") {
      return "espada"
    }

    if (card === "1b") {
      return "hit2"
    }
  }

  return "play"
}
