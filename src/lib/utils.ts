import { IHand, IRoundPoints } from "../truco"
import { ICard, IPlayer, ITeam } from "../types"
import { CARDS } from "./constants"
import memoize from "lodash.memoize"
import partialRight from "lodash.partialright"

export const memoizeMinute = partialRight(memoize, function memoResolver(...args: any[]) {
  const time = new Date().getMinutes()

  args.push({ time })

  const cacheKey = JSON.stringify(args)

  return cacheKey
}) as typeof memoize

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

export function getOpponentTeam(
  teamIdx: 0 | 1 | number | Pick<ITeam, "id"> | Pick<IPlayer, "teamIdx"> | null
): 0 | 1 {
  if (teamIdx === null) {
    return 0
  }

  const idx =
    typeof teamIdx === "number" ? teamIdx : "teamIdx" in teamIdx ? teamIdx.teamIdx : teamIdx.id
  return Number(!idx) as 0 | 1
}

export function checkHandWinner(hand: IHand, forehandTeamIdx: 0 | 1): null | 0 | 1 {
  const roundsWon: IRoundPoints = {
    0: 0,
    1: 0,
    ties: 0,
  }

  const rounds = hand.rounds

  if (hand.flor.winner && hand.flor.state === 5) {
    return hand.flor.winner.id
  }

  for (let i = 0; i < rounds.length; i++) {
    const round = rounds[i]
    if (round.tie) {
      roundsWon[0] += 1
      roundsWon[1] += 1
      roundsWon.ties = roundsWon.ties + 1
      continue
    }

    if (round.unbeatable) {
      roundsWon[round.winner?.teamIdx as 0 | 1] += 1
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
