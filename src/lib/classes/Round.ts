import { getCardValue } from "../utils"
import { ICard, IPlayedCard, PlayedCard } from "./Deck"
import { IPlayer } from "./Player"

export interface IRound {
  tie: boolean
  winner: IPlayer | null
  highest: number
  cards: Array<IPlayedCard>
  turn: number
  nextTurn(): void
  use(playedCard: IPlayedCard): ICard
}

export interface IRoundPoints {
  0: number
  1: number
  ties: number
}

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
