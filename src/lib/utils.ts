import { CARDS } from "./constants"
import { ICard, IPoints, IRound, ITeam } from "./types"

export function getCardValue(card: ICard) {
  return CARDS[card] || -1
}

export function shuffleArray<T = never>(array: Array<T>) {
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
  const roundsWon: IPoints = {
    0: 0,
    1: 0,
    2: 0, // tied rounds
  }

  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i]
    if (round.tie) {
      roundsWon[0] += 1
      roundsWon[1] += 1
      roundsWon[2] = (roundsWon[2] || 0) + 1
      continue
    }
    if (round.winner?.teamIdx === 0) {
      roundsWon[0] += 1
    }
    if (round.winner?.teamIdx === 1) {
      roundsWon[1] += 1
    }
  }

  const ties = roundsWon[2] || 0

  if ((roundsWon[0] > 2 && roundsWon[1] > 2) || (rounds.length > 2 && ties > 0)) {
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

export function checkMatchWinner(teams: Array<ITeam>, matchPoint: number): ITeam | null {
  if (teams[0].points >= matchPoint) {
    return teams[0]
  }
  if (teams[1].points >= matchPoint) {
    return teams[1]
  }
  return null
}
