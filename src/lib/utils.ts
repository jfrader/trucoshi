import { IRound, IRoundPoints, splitCardvalues } from "../truco"
import { ICard, IPlayer } from "../types"
import { CARDS } from "./constants"

// Calculates the Flor points for a player's hand.
// Returns the sum of the envidoValue of three cards of the same suit plus 20, or 0 if no Flor exists.
export function calculateFlorPoints(player: IPlayer): number {
  if (!player.hasFlor) {
    return 0
  }

  const hand = [...player.hand, ...player.usedHand].map(splitCardvalues)

  // Verify that all cards share the same suit (should be true if player.hasFlor is set)
  const sameSuit = hand.every((card) => card.palo === hand[0].palo)
  if (!sameSuit) {
    return 0
  }

  // Sum the envidoValue of all cards (figures are 0)
  const points = hand.reduce((sum, card) => sum + card.value, 20)

  return points
}

export function getMaxNumberIndex<T = number>(array: Array<T>) {
  return array.reduce((accumulator, current, index) => {
    return current > array[accumulator] ? index : accumulator
  }, 0)
}

export function getMinNumberIndex<T = number>(array: Array<T>) {
  return array.reduce((accumulator, current, index) => {
    return current < array[accumulator] ? index : accumulator
  }, 0)
}

export function getCardValue(card: ICard) {
  return CARDS[card] !== undefined ? CARDS[card] : -2
}

export function checkHandWinner(rounds: Array<IRound>, forehandTeamIdx: 0 | 1): null | 0 | 1 {
  const roundsWon: IRoundPoints = {
    0: 0,
    1: 0,
    ties: 0,
  }

  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i]
    if (round.tie) {
      roundsWon[0] += 1
      roundsWon[1] += 1
      roundsWon.ties = roundsWon.ties + 1
      continue
    }
    if (round.winner?.teamIdx === 0) {
      roundsWon[0] += 1
    }
    if (round.winner?.teamIdx === 1) {
      roundsWon[1] += 1
    }
  }

  if (roundsWon[0] > 2 && roundsWon[1] > 2) {
    return forehandTeamIdx
  }

  if (rounds.length > 2 && roundsWon.ties > 0 && rounds[0]?.winner) {
    return rounds[0].winner.teamIdx as 0 | 1
  }

  if (roundsWon[0] >= 2 && roundsWon[1] < 2) {
    return 0
  }

  if (roundsWon[1] >= 2 && roundsWon[0] < 2) {
    return 1
  }

  return null
}
