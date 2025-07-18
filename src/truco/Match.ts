import logger from "../utils/logger"
import { IDeck, IHandPoints, ILobbyOptions, IPlayer, ITeam } from "../types"

import { Hand, IHand } from "./Hand"
import { IPlayInstance } from "./Play"
import { Deck, ITable } from "../lib"

const log = logger.child({ class: "Match" })

export interface IMatch {
  readonly options: ILobbyOptions
  id: string
  teams: [ITeam, ITeam]
  hands: Array<IHand>
  winner: ITeam | null
  prevHand: IHand | null
  currentHand: IHand | null
  deck: IDeck
  table: ITable
  play(): Promise<IPlayInstance | null>
  addPoints(points: IHandPoints): [ITeam, ITeam]
  pushHand(hand: IHand): void
  setPrevHand(hand: IHand | null): IHand | null
  setCurrentHand(hand: IHand | null): IHand | null
  setWinner(winner: ITeam): void
  getNextTurn(): Promise<IteratorResult<IMatch | null, IMatch | null | void>>
}

const playerAbandoned = (player: IPlayer) => player.abandoned

async function* matchTurnGeneratorSequence(match: IMatch) {
  while (!match.winner) {
    if (match.teams[0].players.every(playerAbandoned)) {
      match.setWinner(match.teams[1])
      break
    }

    if (match.teams[1].players.every(playerAbandoned)) {
      match.setWinner(match.teams[0])
      break
    }

    match.setCurrentHand(null)

    yield match

    const newHand = Hand(match, match.hands.length + 1)
    const hand = match.setCurrentHand(await newHand.init()) as IHand
    match.pushHand(hand)
    match.setPrevHand(null)

    while (!hand.finished()) {
      const { value } = hand.getNextTurn()
      if (value) {
        if (value.currentPlayer && value.currentPlayer.disabled && !hand.beforeFinished()) {
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

export function Match(
  id: string,
  table: ITable,
  teams: Array<ITeam> = [],
  options: ILobbyOptions
): IMatch {
  const size = teams[0].players.length

  if (size !== teams[1].players.length) {
    throw new Error("Team size mismatch")
  }

  const match: IMatch = {
    id,
    winner: null,
    deck: Deck(),
    options: structuredClone(options),
    teams: teams as [ITeam, ITeam],
    hands: [],
    table,
    prevHand: null,
    currentHand: null,
    async play() {
      log.trace(
        { players: table.players.map((p) => p.getPublicPlayer()) },
        "Attempting to get match next turn"
      )
      await match.getNextTurn()
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

  for (const player of table.players) {
    match.deck.random.clients[player.idx] = player.secret
  }

  return match
}
