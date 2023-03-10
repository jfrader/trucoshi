import { ICard, IRound, IRoundPoints } from "./classes"
import { CARDS } from "./constants"

export function getMaxNumberIndex<T = number>(array: Array<T>) {
  return array.reduce((accumulator, current, index) => {
    return current > array[accumulator] ? index : accumulator
  }, 0)
}

export function getCardValue(card: ICard) {
  return CARDS[card] || -1
}

export function shuffleArray<T = unknown>(array: Array<T>) {
  let currentIndex = array.length,
    randomIndex

  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex)
    currentIndex--
    ;[array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]]
  }

  return array as Array<T>
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

  if ((roundsWon[0] > 2 && roundsWon[1] > 2) || (rounds.length > 2 && roundsWon.ties > 0)) {
    return forehandTeamIdx
  }

  if (roundsWon[0] >= 2 && roundsWon[1] < 2) {
    return 0
  }

  if (roundsWon[1] >= 2 && roundsWon[0] < 2) {
    return 1
  }

  return null
}
