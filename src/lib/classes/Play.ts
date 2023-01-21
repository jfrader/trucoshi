import { ECommand, EEnvidoCommand, IHand, IPlayInstance } from "../types"

export function PlayInstance(hand: IHand) {
  const instance: IPlayInstance = {
    truco: hand.truco,
    envido: hand.envido,
    handIdx: hand.idx,
    roundIdx: hand.rounds.length,
    player: hand.currentPlayer,
    commands: [],
    rounds: hand.rounds,
    use(idx: number) {
      const player = hand.currentPlayer
      const round = hand.currentRound
      if (!player || !round) {
        return null
      }

      const card = player.useCard(idx)
      if (card) {
        return round.play({ player, card })
      }

      return null
    },
    say(command: ECommand) {
      if (!hand.currentPlayer) {
        return null
      }
      return hand
    },
  }

  if (hand.rounds.length === 1) {
    instance.commands?.push(EEnvidoCommand.ENVIDO)
    instance.commands?.push(EEnvidoCommand.ENVIDO_ENVIDO)
    instance.commands?.push(EEnvidoCommand.REAL_ENVIDO)
    instance.commands?.push(EEnvidoCommand.FALTA_ENVIDO)
  }

  return instance
}
