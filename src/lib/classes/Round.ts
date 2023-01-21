import { IPlayedCard, IRound } from "../types"
import { getCardValue } from "../utils"

export function Round(): IRound {
  const round: IRound = {
    highest: -1,
    winner: null,
    cards: [],
    tie: false,
    play({ card, player }: IPlayedCard) {
      const value = getCardValue(card)
      if (round.highest > -1 && value === round.highest) {
        round.tie = true
      }
      if (value > round.highest) {
        round.tie = false
        round.highest = value
        round.winner = player
      }
      round.cards.push({ card, player })
      return card
    },
  }

  return round
}
