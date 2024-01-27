import { IRound, IRoundPoints } from "../truco"
import { ICard } from "../types"
import { CARDS } from "./constants"

export function getMaxNumberIndex<T = number>(array: Array<T>) {
  return array.reduce((accumulator, current, index) => {
    return current > array[accumulator] ? index : accumulator
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
