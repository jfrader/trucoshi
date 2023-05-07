import logger from "../../utils/logger"
import { IDeck, IHandPoints, ILobbyOptions, IPlayer, ITeam } from "../../types"
import { Deck } from "./Deck"
import { Hand, IHand } from "./Hand"
import { IPlayInstance } from "./Play"
import { ITable } from "./Table"

export interface IMatch {
  readonly options: ILobbyOptions
  teams: [ITeam, ITeam]
  hands: Array<IHand>
  winner: ITeam | null
  prevHand: IHand | null
  currentHand: IHand | null
  deck: IDeck
  table: ITable
  play(): IPlayInstance | null
  addPoints(points: IHandPoints): [ITeam, ITeam]
  pushHand(hand: IHand): void
  setPrevHand(hand: IHand | null): IHand | null
  setCurrentHand(hand: IHand | null): IHand | null
  setWinner(winner: ITeam): void
  getNextTurn(): IteratorResult<IMatch | null, IMatch | null | void>
}

const playerAbandoned = (player: IPlayer) => player.abandoned

function* matchTurnGeneratorSequence(match: IMatch) {
  while (!match.winner) {
    if (match.teams[0].players.every(playerAbandoned)) {
      match.setWinner(match.teams[1])
      break
    }

    if (match.teams[1].players.every(playerAbandoned)) {
      match.setWinner(match.teams[0])
      break
    }

    match.deck.shuffle()
    match.setCurrentHand(null)

    yield match

    const hand = match.setCurrentHand(Hand(match, match.hands.length + 1)) as IHand
    match.pushHand(hand)

    while (!hand.finished()) {
      const { value } = hand.getNextTurn()
      if (value) {
        if (
          value.currentPlayer &&
          (value.currentPlayer.disabled || value.currentPlayer.abandoned)
        ) {
          value.nextTurn()
          continue
        }
        if (value.finished()) {
          break
        }
      }
      match.setCurrentHand(value as IHand)
      yield match
    }

    match.setPrevHand(hand)
    match.setCurrentHand(null)

    const teams = match.addPoints(hand.points)
    const winner = teams.find((team) => team.points.winner)

    if (winner) {
      match.setWinner(winner)
      match.setCurrentHand(null)
      break
    }
    match.table.nextHand()
  }
  yield match
}

export function Match(table: ITable, teams: Array<ITeam> = [], options: ILobbyOptions): IMatch {
  const size = teams[0].players.length

  if (size !== teams[1].players.length) {
    throw new Error("Team size mismatch")
  }

  const match: IMatch = {
    winner: null,
    deck: Deck(),
    options: structuredClone(options),
    teams: teams as [ITeam, ITeam],
    hands: [],
    table,
    prevHand: null,
    currentHand: null,
    play() {
      logger.trace(
        { players: table.players.map((p) => p.getPublicPlayer()) },
        "Attempting to get match next turn"
      )
      match.getNextTurn()
      if (!match.currentHand) {
        return null
      }
      return match.currentHand.play(match.prevHand)
    },
    addPoints(points) {
      match.teams[0].addPoints(match.options.matchPoint, points[0])
      match.teams[1].addPoints(match.options.matchPoint, points[1])
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
      return turnGenerator.next()
    },
  }

  const turnGenerator = matchTurnGeneratorSequence(match)

  return match
}
