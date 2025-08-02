import {
  ECommand,
  EEnvidoAnswerCommand,
  EEnvidoCommand,
  EFlorCommand,
  EHandState,
  ESayCommand,
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

  if (
    state === EHandState.WAITING_FOR_TRUCO_ANSWER &&
    Object.values(EEnvidoCommand).includes(command as EEnvidoCommand)
  ) {
    return player.bot ? "bot" : "hit"
  }

  if (state === EHandState.WAITING_ENVIDO_ANSWER && command === EFlorCommand.FLOR) {
    if (Math.random() < 0.34) {
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
