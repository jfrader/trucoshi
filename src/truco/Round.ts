import { ICard, IPlayedCard, IPlayer } from "../types"
import { getCardValue } from "../lib/utils"
import { CARDS, PlayedCard } from "../lib"

export interface IRound {
  tie: boolean
  winner: IPlayer | null
  highest: number
  cards: Array<IPlayedCard>
  turn: number
  unbeatable: boolean
  nextTurn(): void

  use(playedCard: IPlayedCard, handPlayedCards: IPlayedCard[]): ICard
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
    unbeatable: false,
    nextTurn() {
      round.turn++
    },
    use(playedCard, handPlayedCards) {
      const { card, player } = playedCard
      const value = getCardValue(card)

      if (value === round.highest && player.teamIdx !== round.winner?.teamIdx) {
        round.tie = true
      }
      if (value > round.highest) {
        round.tie = false
        round.highest = value
        round.winner = player as IPlayer
      }

      round.cards.push(playedCard)

      round.unbeatable = isCardUnbeatable(card, handPlayedCards)

      return card
    },
  }

  return round
}

function isCardUnbeatable(card: ICard, handPlayedCards: IPlayedCard[]): boolean {
  const currentValue = getCardValue(card)

  if (currentValue === 13) {
    return true
  }

  const allCards = Object.keys(CARDS) as ICard[]

  const playedCardKeys = handPlayedCards.map((playedCard) => playedCard.card)

  const unplayedCards = allCards.filter((c) => !playedCardKeys.includes(c))

  const highestUnplayedValue = unplayedCards.reduce((max, c) => {
    const value = getCardValue(c)
    return value > max ? value : max
  }, -1)

  return currentValue > highestUnplayedValue
}
