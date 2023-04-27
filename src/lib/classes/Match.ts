import { IHandPoints, IPlayer, ITeam } from "../../types"
import { Deck } from "./Deck"
import { Hand, IHand } from "./Hand"
import { IPlayInstance } from "./Play"
import { ITable } from "./Table"

export interface IMatch {
  teams: [ITeam, ITeam]
  hands: Array<IHand>
  winner: ITeam | null
  prevHand: IHand | null
  currentHand: IHand | null
  matchPoint: number
  table: ITable
  play(): IPlayInstance | null
  addPoints(points: IHandPoints): [ITeam, ITeam]
  pushHand(hand: IHand): void
  setPrevHand(hand: IHand | null): IHand | null
  setCurrentHand(hand: IHand | null): IHand | null
  setWinner(winner: ITeam): void
  getNextTurn(): IteratorResult<IMatch | null, IMatch | null | void>
}

const playerIsNotReady = (player: IPlayer) => !player.ready

export function Match(table: ITable, teams: Array<ITeam> = [], matchPoint: number = 9): IMatch {
  const deck = Deck().shuffle()

  const size = teams[0].players.length

  if (size !== teams[1].players.length) {
    throw new Error("Team size mismatch")
  }

  function* handsGeneratorSequence() {
    while (!match.winner) {
      if (match.teams[0].players.every(playerIsNotReady)) {
        match.setWinner(match.teams[1])
        break
      }

      if (match.teams[1].players.every(playerIsNotReady)) {
        match.setWinner(match.teams[0])
        break
      }

      deck.shuffle()

      match.setPrevHand(match.hands.at(-1) || null)
      match.setCurrentHand(null)

      yield match

      const hand = match.setCurrentHand(Hand(match, deck, match.hands.length + 1)) as IHand
      match.pushHand(hand)

      while (!hand.finished()) {
        const { value } = hand.getNextPlayer()
        if (value) {
          if (value.currentPlayer && (value.currentPlayer.disabled || !value.currentPlayer.ready)) {
            value.nextTurn()
            continue
          }
          if (value.finished()) {
            continue
          }
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
    matchPoint,
    teams: teams as [ITeam, ITeam],
    hands: [],
    table,
    prevHand: null,
    currentHand: null,
    play() {
      match.getNextTurn()
      if (!match.currentHand) {
        return null
      }
      return match.currentHand.play(match.prevHand)
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
    setPrevHand(hand) {
      match.prevHand = hand
      return match.prevHand
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
