import logger from "../utils/logger"
import { ICard, IPlayedCard, IPlayer } from "../types"
import { getCardValue } from "../lib/utils"
import { PlayedCard } from "../lib"

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

export function Round(): IRound {
  const round: IRound = {
    turn: 0,
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
        round.winner = player as IPlayer
      }
      round.cards.push(PlayedCard(player, card))
      return card
    },
  }

  return round
}
