import { IRound } from "../types"
import { getCardValue } from "../utils"
import { PlayedCard } from "./Deck"

export function Round(turn: number): IRound {
  const round: IRound = {
    turn,
    highest: -1,
    winner: null,
    cards: [],
    tie: false,
    nextTurn() {
      round.turn++
    },
    use({ card, player }) {
      const value = getCardValue(card)
      if (value === round.highest && player.teamIdx !== round.winner?.teamIdx) {
        round.tie = true
      }
      if (value > round.highest) {
        round.tie = false
        round.highest = value
        round.winner = player
      }
      round.cards.push(PlayedCard(player, card))
      return card
    },
  }

  return round
}
