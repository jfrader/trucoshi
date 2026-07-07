import logger from "../utils/logger"
import { IDeck, IHandPoints, ILobbyOptions, IPlayer, ITeam, ITutorialRuntime } from "../types"

import { Hand, IHand } from "./Hand"
import { IPlayInstance } from "./Play"
import { Deck, ITable, PICA_PICA_TEAM_SIZE, PICA_PICA_TRIGGER_PERCENT } from "../lib"

const log = logger.child({ class: "Match" })

export interface IMatch {
  readonly options: ILobbyOptions
  readonly tutorial?: ITutorialRuntime
  id: string
  teams: [ITeam, ITeam]
  hands: Array<IHand>
  winner: ITeam | null
  currentHand: IHand | null
  deck: IDeck
  table: ITable
  get activePlayers(): IPlayer[]
  play(): Promise<IPlayInstance | null>
  addPoints(points: IHandPoints): [ITeam, ITeam]
  pushHand(hand: IHand): void
  setCurrentHand(hand: IHand | null): IHand | null
  setWinner(winner: ITeam): void
  getNextTurn(): Promise<IteratorResult<IMatch | null, IMatch | null | void>>
}

const playerAbandoned = (player: IPlayer) => player.abandoned
type IPicaPair = [IPlayer, IPlayer]

const getPicaPairs = (players: IPlayer[]): IPicaPair[] => {
  if (players.length !== PICA_PICA_TEAM_SIZE) {
    return []
  }

  const half = players.length / 2
  const pairs: IPicaPair[] = []
  for (let i = 0; i < half; i++) {
    pairs.push([players[i], players[i + half]])
  }

  return pairs
}

async function* matchTurnGeneratorSequence(match: IMatch) {
  const picaPairs = getPicaPairs(match.table.players)
  const picaTriggerPoints = Math.ceil(match.options.matchPoint * PICA_PICA_TRIGGER_PERCENT)
  let picaActivated = false
  let picaEnded = false
  let nextModeIsPica = false

  while (!match.winner) {
    if (match.teams[0].players.every(playerAbandoned)) {
      match.setWinner(match.teams[1])
      break
    }

    if (match.teams[1].players.every(playerAbandoned)) {
      match.setWinner(match.teams[0])
      break
    }

    if (!picaEnded && match.table.players.some((player) => player.abandoned)) {
      picaEnded = true
      if (picaActivated) {
        log.info({ matchId: match.id }, "Pica-pica ended: a player abandoned")
      }
    }

    if (
      !picaActivated &&
      !picaEnded &&
      match.table.players.length === PICA_PICA_TEAM_SIZE &&
      match.teams.some(
        (team) => Math.max(team.points.malas, team.points.buenas) >= picaTriggerPoints
      )
    ) {
      picaActivated = true
      nextModeIsPica = true
      log.info(
        { matchId: match.id, trigger: picaTriggerPoints, pairs: picaPairs.map((pair) => pair.map((p) => p.idx)) },
        "Pica-pica mode activated"
      )
    }

    const picaHand = picaActivated && !picaEnded && nextModeIsPica
    if (picaActivated && !picaEnded) {
      nextModeIsPica = !nextModeIsPica
    }

    const handsToPlay: Array<IPicaPair | null> = picaHand ? picaPairs : [null]

    for (const pair of handsToPlay) {
      match.setCurrentHand(null)
      yield match

      const newHand = Hand(match, match.hands.length + 1)
      const hand = match.setCurrentHand(await newHand.init()) as IHand

      if (pair) {
        const pairPlayers = new Set(pair.map((player) => player.key))
        for (const player of match.table.players) {
          if (!pairPlayers.has(player.key)) {
            player.disable()
          }
        }
      }

      match.pushHand(hand)

      if (pair) {
        log.trace(
          { matchId: match.id, handIdx: hand.idx, pair: pair.map((player) => player.idx) },
          "Pica-pica mini-hand started"
        )
      }

      while (!hand.finished()) {
        const { value } = hand.getNextTurn()
        if (value) {
          if (value.currentPlayer && value.currentPlayer.disabled && !hand.displayingPreviousHand()) {
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

    if (match.winner) {
      break
    }
  }
  yield match
}

export function Match(
  id: string,
  table: ITable,
  teams: Array<ITeam> = [],
  options: ILobbyOptions,
  tutorial?: ITutorialRuntime
): IMatch {
  const size = teams[0].players.length

  if (size !== teams[1].players.length) {
    throw new Error("Team size mismatch")
  }

  const match: IMatch = {
    id,
    tutorial,
    winner: null,
    deck: Deck(),
    options: structuredClone(options),
    teams: teams as [ITeam, ITeam],
    hands: [],
    table,
    currentHand: null,
    get activePlayers() {
      return match.table.players.filter((p) => !p.disabled)
    },
    async play() {
      log.trace(
        {
          rounds: match.currentHand?.roundsLogFlatten,
          winner: match.winner,
          options: match.options,
          players: table.players.map((p) => p.getPublicPlayer("log")),
        },
        "Attempting to get match next turn"
      )

      await match.getNextTurn()

      if (!match.currentHand) {
        return null
      }
      return match.currentHand.play()
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
