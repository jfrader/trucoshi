import { Deck } from "./Deck"
import { Hand, IHand, IHandPoints } from "./Hand"
import { IPlayInstance } from "./Play"
import { ITable } from "./Table"
import { ITeam } from "./Team"

export interface IMatch {
  teams: [ITeam, ITeam]
  hands: Array<IHand>
  winner: ITeam | null
  currentHand: IHand | null
  table: ITable
  play(): IPlayInstance | null
  addPoints(points: IHandPoints): [ITeam, ITeam]
  pushHand(hand: IHand): void
  setCurrentHand(hand: IHand | null): IHand | null
  setWinner(winner: ITeam): void
  getNextTurn(): IteratorResult<IMatch | null, IMatch | null | void>
}

export function Match(table: ITable, teams: Array<ITeam> = [], matchPoint: number = 9): IMatch {
  const deck = Deck().shuffle()

  const size = teams[0].players.length

  if (size !== teams[1].players.length) {
    throw new Error("Team size mismatch")
  }

  function* handsGeneratorSequence() {
    while (!match.winner) {
      deck.shuffle()
      const hand = match.setCurrentHand(Hand(match, deck, match.hands.length + 1)) as IHand
      match.pushHand(hand)
      while (!hand.finished()) {
        const { value } = hand.getNextPlayer()
        if (value && value.finished()) {
          continue
        }
        match.setCurrentHand(value as IHand)
        yield match
      }

      match.setCurrentHand(null)

      const teams = match.addPoints(hand.points)
      const winner = teams.find((team) => team.points.winner)

      if (winner) {
        match.setWinner(winner)
        match.setCurrentHand(null)
        break
      }
      match.table.nextTurn()
    }
    yield match
  }

  const handsGenerator = handsGeneratorSequence()

  const match: IMatch = {
    winner: null,
    teams: teams as [ITeam, ITeam],
    hands: [],
    table,
    currentHand: null,
    play() {
      match.getNextTurn()
      if (!match.currentHand) {
        return null
      }
      return match.currentHand.play()
    },
    addPoints(points) {
      match.teams[0].addPoints(matchPoint, points[0])
      match.teams[1].addPoints(matchPoint, points[1])
      return match.teams
    },
    pushHand(hand) {
      match.hands.push(hand)
    },
    setCurrentHand(hand) {
      match.currentHand = hand
      return match.currentHand
    },
    setWinner(winner) {
      match.winner = winner
    },
    getNextTurn() {
      return handsGenerator.next()
    },
  }

  return match
}
