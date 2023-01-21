import { EEnvidoCommand, ESayCommand, IHand, IPlayInstance } from "../types"

export function PlayInstance(hand: IHand) {

  const instance: IPlayInstance = {
    state: hand.state,
    truco: hand.truco,
    envido: hand.envido,
    handIdx: hand.idx,
    roundIdx: hand.rounds.length,
    player: hand.currentPlayer,
    commands: [],
    rounds: hand.rounds,
    use(idx) {
      const player = hand.currentPlayer
      const round = hand.currentRound
      if (!player || !round) {
        return null
      }

      const card = player.useCard(idx)
      if (card) {
        return round.use({ player, card })
      }

      return null
    },
    say(command) {
      if (!hand.currentPlayer || !instance.commands?.includes(command)) {
        return null
      }

      hand.commands[command](hand.currentPlayer)

      return command
    },
  }
  
  instance.commands?.push(ESayCommand.MAZO)
  instance.commands?.push(ESayCommand.TRUCO)

  if (hand.rounds.length === 1) {
    instance.commands?.push(EEnvidoCommand.ENVIDO)
  }

  return instance
}
