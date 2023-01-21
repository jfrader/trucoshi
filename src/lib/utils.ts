import { CARDS } from "./constants"
import { ICard, IRound, ITeam, RoundPoints } from "./types"

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

export function checkHandWinner(
  rounds: Array<IRound>,
  forehandTeamIdx: 0 | 1,
  disabledPlayerIds: Array<string>,
  teams: [ITeam, ITeam]
): null | 0 | 1 {
  let winningTeamIdx = null

  // End hand if all players in one team go MAZO
  if (disabledPlayerIds.length) {
    const disabledTeams = teams.map((team) => {
      const forfeited = team.players.filter((player) => disabledPlayerIds.includes(player.id))
      return forfeited.length === team.players.length
    })
    if (disabledTeams[0] && disabledTeams[1]) {
      return forehandTeamIdx
    }
    if (disabledTeams[0]) {
      return 1
    }
    if (disabledTeams[1]) {
      return 0
    }
  }

  const roundsWon: RoundPoints = {
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