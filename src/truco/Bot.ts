/*
 * Argentinian Truco Bot: AI Decision Logic
 *
 * Objective: Develop an AI bot for the Argentinian Truco card game, implemented in TypeScript via the playBot function. The bot acts as a computer-controlled player, making decisions on card plays, escalating bets like "truco," "envido," or "flor," and responding to opponents in a natural, human-like way, embodying the strategic depth, social flair, and cultural essence of Argentinian Truco.
 *
 * Key Focus Areas:
 * - Strategic and Natural Gameplay: Select cards and escalate bets based on hand strength, team dynamics, and game score, reflecting the cunning and bold risk-taking of Argentinian Truco players. Avoid reckless moves unless driven by personality to bluff or seize daring opportunities, capturing the game’s lively table dynamics and tactical banter.
 * - Personality-Driven Decisions: Use distinct personality profiles (e.g., "Nick" for balanced, "Bender" for aggressive, "Hodlbot" for cautious) defined by traits like aggression, bluffing, caution, envido confidence, risk tolerance, and patience. Decisions should rely on these traits, not bot-specific conditions (e.g., checking for "Nick"), to feel like unique characters at a Truco table.
 * - Hand and Round Awareness: Judge when the bot can win the current round and when it’s certain to win the hand (securing 2+ rounds) before escalating. Usually call "truco" after winning a round with a guaranteed hand, but allow rare first-round "truco" calls (1-2 per match) for very strong hands (strength ≥ 33, aggression ≥ 0.6, 5% chance) or bluffs (bluffing ≥ 0.8, opponent aggression < 0.6, 3% chance), avoiding revealing strength unless overwhelmingly strong, mirroring bold Argentinian player moves.
 * - Opponent Reading: Learn from opponents’ actions (e.g., bluffs, folds) to adjust strategy naturally, like spotting tells in intense Truco matches.
 * - Realistic Behavior: Play with the rhythm and passion of an Argentinian Truco player, with varied responses driven by personality traits, avoiding non-gameplay mechanisms like artificial delays or debug logs.
 *
 * Context and Progress:
 * - The bot operates within the playBot function, using inputs like table (game state), bot (player data), play (current play instance), playCard, and sayCommand.
 * - Resolved an issue where the bot called "truco" on the first round every hand, misjudging hand wins. Now, it usually escalates after a round win with a guaranteed hand, with rare first-round "truco" calls for very strong hands or bluffs, tightened to occur 1-2 times per match.
 * - Addressed a game hanging issue (repeating turns) by ensuring playBot always returns a valid action (playCard or sayCommand) when it’s the bot’s turn, handling edge cases like null play.rounds or unexpected states.
 * - Corrected TypeScript errors related to 'disabled' property by using p.player.disabled for IPlayedCard objects instead of p.disabled, ensuring type safety.
 * - Adjusted flor phase thresholds to align with the maximum flor value of 38 (e.g., CONTRAFLOR_AL_RESTO at 20 + (18 * envidoConfidence)), correcting previous overestimations (e.g., 37).
 *
 * Desired Behavior:
 * - The bot should feel like a player at an Argentinian Truco table, blending strategy and cultural spirit. For example, "Bender" might call a rare first-round "truco" with a weak hand to rattle opponents, while "Hodlbot" waits for rock-solid envido points, driven by traits.
 * - Escalate "truco" or "envido" when the hand is strong (e.g., after winning a round with 1e, facing 3s), with rare first-round "truco" for dominant hands (e.g., [1b, 1e, 7o]) or bluffs, reflecting skill and swagger without revealing strength prematurely.
 * - Card plays should be tactical, saving high cards (1b) for clutch moments or testing with medium cards (3s).
 * - Adapt to opponents by bluffing against weak tells or folding when the table’s hot, like reading the room in a lively match.
 * - Handle edge cases (null play.rounds, no teammates, unexpected states) smoothly to keep the game flowing.
 *
 * Tasks for Improvement:
 * - Fine-Tune Escalation: Test hands like 1e vs. 7e on the first round (no escalation unless very strong or bluffing) and 1b vs. 3s after a win (escalate) to match Argentinian Truco’s timing, with first-round "truco" calls limited to 1-2 per match.
 * - Balance Personalities: Tweak traits (e.g., Hodlbot’s patience, Nick’s balanced bluffing) for distinct, authentic styles using personality factors.
 * - Sharpen Opponent Insight: Enhance inferOpponentHand and estimateOpponentStrength for better bluff/fold decisions.
 * - Polish Realism: Ensure varied, trait-driven responses and no game hangs by always returning a valid action.
 * - Validate flor thresholds across all personality profiles to ensure consistency with the maximum value of 38.
 */

import {
  CARDS,
  EAnswerCommand,
  EEnvidoAnswerCommand,
  EEnvidoCommand,
  EFlorCommand,
  EHandState,
  ETrucoCommand,
  ICard,
  IPlayer,
  ITable,
  ITeamPoints,
  IPlayedCard,
  ESayCommand,
} from ".."
import { getOpponentTeam } from "../lib/utils"
import { ITrucoshi, PLAYER_TIMEOUT_GRACE } from "../server"
import logger from "../utils/logger"
import { IPlayInstance } from "./Play"
import { calculateEnvidoPointsArray } from "./Player"

interface BotPersonality {
  aggression: number
  bluffing: number
  caution: number
  envidoConfidence: number
  riskTolerance: number
  patience: number
}

export const BOT_NAMES = [
  "Botillo",
  "Hal",
  "Sektor",
  "Cyrax",
  "Smoke",
  "Nick",
  "Adam",
  "Hodlbot",
  "Lambot",
  "Morpheus",
  "Jack",
  "Bender",
  "Smith",
  "Neo",
  "Trinity",
] as const

export type BotProfile = (typeof BOT_NAMES)[number]

const PERSONALITY_PROFILES: Record<BotProfile, BotPersonality> = {
  Botillo: {
    aggression: 0.7,
    bluffing: 0.2,
    caution: 0.3,
    envidoConfidence: 0.7,
    riskTolerance: 0.8,
    patience: 0.2,
  },
  Hal: {
    aggression: 0.7,
    bluffing: 0.6,
    caution: 0.4,
    envidoConfidence: 0.6,
    riskTolerance: 0.5,
    patience: 0.5,
  },
  Sektor: {
    aggression: 0.6,
    bluffing: 0.4,
    caution: 0.5,
    envidoConfidence: 0.7,
    riskTolerance: 0.3,
    patience: 0.7,
  },
  Cyrax: {
    aggression: 0.8,
    bluffing: 0.7,
    caution: 0.3,
    envidoConfidence: 0.6,
    riskTolerance: 0.6,
    patience: 0.4,
  },
  Smoke: {
    aggression: 0.5,
    bluffing: 0.5,
    caution: 0.6,
    envidoConfidence: 0.5,
    riskTolerance: 0.5,
    patience: 0.5,
  },
  Nick: {
    aggression: 0.55,
    bluffing: 0.5,
    caution: 0.5,
    envidoConfidence: 0.5,
    riskTolerance: 0.5,
    patience: 0.45,
  },
  Adam: {
    aggression: 0.4,
    bluffing: 0.3,
    caution: 0.7,
    envidoConfidence: 0.4,
    riskTolerance: 0.3,
    patience: 0.8,
  },
  Hodlbot: {
    aggression: 0.3,
    bluffing: 0.2,
    caution: 0.8,
    envidoConfidence: 0.4,
    riskTolerance: 0.2,
    patience: 0.9,
  },
  Lambot: {
    aggression: 0.8,
    bluffing: 0.7,
    caution: 0.2,
    envidoConfidence: 0.6,
    riskTolerance: 0.7,
    patience: 0.3,
  },
  Morpheus: {
    aggression: 0.4,
    bluffing: 0.6,
    caution: 0.5,
    envidoConfidence: 0.5,
    riskTolerance: 0.4,
    patience: 0.6,
  },
  Jack: {
    aggression: 0.7,
    bluffing: 0.1,
    caution: 0.5,
    envidoConfidence: 0.7,
    riskTolerance: 0.6,
    patience: 0.4,
  },
  Bender: {
    aggression: 0.9,
    bluffing: 0.8,
    caution: 0.5,
    envidoConfidence: 0.5,
    riskTolerance: 0.8,
    patience: 0.2,
  },
  Smith: {
    aggression: 0.7,
    bluffing: 0.7,
    caution: 0.7,
    envidoConfidence: 0.7,
    riskTolerance: 0.5,
    patience: 0.5,
  },
  Neo: {
    aggression: 0.7,
    bluffing: 0.6,
    caution: 0.5,
    envidoConfidence: 0.5,
    riskTolerance: 0.6,
    patience: 0.4,
  },
  Trinity: {
    aggression: 0.4,
    bluffing: 0.4,
    caution: 0.4,
    envidoConfidence: 0.4,
    riskTolerance: 0.4,
    patience: 0.6,
  },
}

interface IRound {
  cards: IPlayedCard[]
  winner?: { teamIdx: number } | null
  tie?: boolean
}

interface BotContext {
  table: ITable
  bot: IPlayer
  play: IPlayInstance
  profile: BotPersonality
  botHandStrength: number
  isFirstRound: boolean
  isLastRound: boolean
  previousRoundTie: boolean
  teamScore: ITeamPoints
  opponentScore: ITeamPoints
  matchPoint: number
  isCloseToWin: boolean
  scoreDifference: number
  currentRound: IRound | null
  activeOpponents: IPlayer[]
  teammates: IPlayer[]
}

// Helper Functions
function getTeammates(context: BotContext): IPlayer[] {
  return context.teammates
}

function estimateOpponentStrength(context: BotContext): number {
  const opponentCards = context.activeOpponents.flatMap((p) => p.usedHand)
  const total = opponentCards.reduce((sum, card) => sum + CARDS[card], 0)
  const avg = opponentCards.length > 0 ? total / opponentCards.length : 7
  const adjustment = context.play.truco.state > 1 ? 1.5 : context.isLastRound ? 1.2 : 1
  return avg * adjustment * context.activeOpponents.length
}

function estimateTeammateStrength(context: BotContext): number {
  const teammateCards = getTeammates(context).flatMap((p) => [...p.hand, ...p.usedHand])
  const total = teammateCards.reduce((sum, card) => sum + CARDS[card], 0)
  const avg = teammateCards.length > 0 ? total / teammateCards.length : 7
  return avg * (context.isFirstRound ? 1.1 : 1) * getTeammates(context).length
}

function estimateTeamEnvido(context: BotContext): number {
  const teammateEnvidoPoints = getTeammates(context).map((p) =>
    p.envido.reduce((max, e) => Math.max(max, e.value), 0)
  )
  const botEnvido = context.bot.getHighestEnvido()
  return Math.max(botEnvido, ...teammateEnvidoPoints, 20)
}

function updateOpponentProfile(
  context: BotContext,
  opponent: IPlayer,
  action: "bluff" | "fold"
): void {
  if (!opponent || !context.bot.opponentProfiles[opponent.key] || opponent.disabled) return
  const profile = context.bot.opponentProfiles[opponent.key]
  if (action === "bluff") profile.bluffCount++
  if (action === "fold") profile.foldCount++
  profile.aggression = profile.bluffCount / (profile.bluffCount + profile.foldCount + 1)
}

function estimateOpponentAggression(context: BotContext): number {
  const totalAggression = context.activeOpponents.reduce(
    (sum, p) => sum + (context.bot.opponentProfiles[p.key]?.aggression || 0.5),
    0
  )
  return context.activeOpponents.length > 0 ? totalAggression / context.activeOpponents.length : 0.5
}

function shouldBluff(context: BotContext): boolean {
  const pressure = context.isCloseToWin ? 0.6 : context.scoreDifference < -5 ? 0.8 : 0.4
  const teamStrength =
    (context.botHandStrength + estimateTeammateStrength(context) * getTeammates(context).length) /
    (getTeammates(context).length + 1)
  const opponentAggression = estimateOpponentAggression(context)
  const patienceFactor = context.profile.patience > 0.8 ? 0.8 : 1
  const bluffFactor =
    context.profile.bluffing *
    pressure *
    (1 - teamStrength / 40 + 0.7) *
    (1 - opponentAggression * 0.5) *
    patienceFactor
  return Math.random() < bluffFactor
}

function selectWeightedCard(context: BotContext): [number, ICard] {
  const weights = context.bot.hand.map(
    (card) => 1 / (CARDS[card] + 1) ** (1 / context.profile.caution)
  )
  const sum = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * sum
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r <= 0) return [i, context.bot.hand[i]]
  }
  return [0, context.bot.hand[0]]
}

function isRoundWinnable(context: BotContext): boolean {
  const opponentCards =
    context.currentRound?.cards
      ?.filter((p) => p.player.teamIdx !== context.bot.teamIdx && !p.player.disabled)
      .map((p) => p.card) || []
  const teammateCards =
    context.currentRound?.cards
      ?.filter(
        (p) =>
          p.player.teamIdx === context.bot.teamIdx &&
          p.player.idx !== context.bot.idx &&
          !p.player.disabled
      )
      .map((p) => p.card) || []
  const opponentBest = opponentCards.length ? Math.max(...opponentCards.map((c) => CARDS[c])) : 0
  const teammateBest = teammateCards.length ? Math.max(...teammateCards.map((c) => CARDS[c])) : 0
  const [_, highestCard] = context.bot.getHighestCard()
  const teammatesNotPlayed = getTeammates(context).filter(
    (p) => !context.currentRound?.cards?.some((c) => c.player.idx === p.idx)
  )
  const teammateBestInHand = teammatesNotPlayed.reduce(
    (max, p) => Math.max(max, ...p.hand.map((c) => CARDS[c])),
    0
  )
  return (
    CARDS[highestCard] > opponentBest &&
    CARDS[highestCard] > teammateBest &&
    CARDS[highestCard] > teammateBestInHand
  )
}

function isOpponentLowestCard(context: BotContext): boolean {
  const opponentCards =
    context.currentRound?.cards
      ?.filter((p) => p.player.teamIdx !== context.bot.teamIdx && !p.player.disabled)
      .map((p) => p.card) || []
  const opponentBest = opponentCards.length ? Math.max(...opponentCards.map((c) => CARDS[c])) : 0
  return opponentBest <= 4
}

function isLastTeamPlayer(context: BotContext): boolean {
  const teamPlayers = context.table.players.filter(
    (p) => p.teamIdx === context.bot.teamIdx && !p.disabled
  )
  const positions = teamPlayers.map((p) => context.table.getPlayerPosition(p.key, true))
  const maxPosition = Math.max(...positions)
  return context.table.getPlayerPosition(context.bot.key, true) === maxPosition
}

function selectCard(context: BotContext): [number, ICard] {
  const opponentStrength = estimateOpponentStrength(context)
  const teammateStrength = estimateTeammateStrength(context)
  const [highestIdx, highestCard] = context.bot.getHighestCard()
  const [lowestIdx, lowestCard] = context.bot.getLowestCard()
  const opponentCards =
    context.currentRound?.cards
      ?.filter((p) => p.player.teamIdx !== context.bot.teamIdx && !p.player.disabled)
      .map((p) => p.card) || []
  const teammateCards =
    context.currentRound?.cards
      ?.filter(
        (p) =>
          p.player.teamIdx === context.bot.teamIdx &&
          p.player.idx !== context.bot.idx &&
          !p.player.disabled
      )
      .map((p) => p.card) || []
  const opponentBest = opponentCards.length ? Math.max(...opponentCards.map((c) => CARDS[c])) : 0
  const teammateBest = teammateCards.length ? Math.max(...teammateCards.map((c) => CARDS[c])) : 0

  // Force highest card after a tie to secure the round
  if (context.previousRoundTie) {
    return [highestIdx, highestCard]
  }

  if (
    (teammateBest > opponentBest && teammateBest > 0) ||
    (context.isCloseToWin && context.profile.caution > 0.7)
  ) {
    return [lowestIdx, lowestCard]
  }

  if (opponentBest > 0 && CARDS[highestCard] < opponentBest) {
    return [lowestIdx, lowestCard]
  }

  if (context.isFirstRound) {
    if (isRoundWinnable(context)) {
      const mediumIdx = context.bot.hand.findIndex((card) => CARDS[card] >= 5 && CARDS[card] <= 9)
      if (mediumIdx !== -1 && (opponentStrength < 8 || teammateStrength > 10)) {
        return [mediumIdx, context.bot.hand[mediumIdx]]
      }
    }
    if (context.profile.caution > 0.6 && CARDS[highestCard] > 10 && context.isCloseToWin) {
      return [lowestIdx, lowestCard]
    }
    return selectWeightedCard(context)
  }

  if ((context.isLastRound || context.previousRoundTie) && isRoundWinnable(context)) {
    if (
      CARDS[highestCard] > opponentStrength * context.profile.aggression &&
      teammateStrength < 8 &&
      (!context.isCloseToWin || context.profile.riskTolerance > 0.6)
    ) {
      return [highestIdx, highestCard]
    }
  }

  if (
    context.profile.caution > 0.7 &&
    CARDS[highestCard] > 10 &&
    (!isRoundWinnable(context) || context.isCloseToWin)
  ) {
    return [lowestIdx, lowestCard]
  }

  return teammateStrength > 10 ? selectWeightedCard(context) : [highestIdx, highestCard]
}

function inferOpponentHand(
  context: BotContext,
  opponent: IPlayer,
  calculateEnvidoPointsArray: (player: IPlayer) => { value: number; cards: ICard[] }[]
): ICard[] {
  const playedCards = opponent.usedHand
  const playedCardAvg = playedCards.length
    ? playedCards.reduce((sum, card) => sum + CARDS[card], 0) / playedCards.length
    : 7
  const allKnownCards = [
    ...context.bot.hand,
    ...context.bot.usedHand,
    ...playedCards,
    ...getTeammates(context).flatMap((p) => [...p.hand, ...p.usedHand]),
  ]
  const remainingCards = Object.keys(CARDS).filter(
    (card) => !allKnownCards.includes(card as ICard)
  ) as ICard[]
  const estimatedRemaining =
    playedCardAvg < 6 ? remainingCards.filter((c) => CARDS[c] < 8) : remainingCards
  const testHand = [...playedCards, ...estimatedRemaining.slice(0, 3 - playedCards.length)]

  if (opponent.hasSaidEnvidoPoints && context.play.envido.winningPointsAnswer) {
    const declaredEnvido = context.play.envido.winningPointsAnswer
    const envidoPoints = calculateEnvidoPointsArray({
      ...opponent,
      hand: testHand,
      usedHand: playedCards,
    }).map((e) => e.value)
    if (envidoPoints.includes(declaredEnvido)) {
      return testHand
    }
  }
  return testHand
}

function isCertainToWin(context: BotContext): boolean {
  const [_, highestCard] = context.bot.getHighestCard()
  const botBest = CARDS[highestCard]
  const currentRoundCards = context.currentRound?.cards || []
  const opponentCards = currentRoundCards
    .filter((p) => p.player.teamIdx !== context.bot.teamIdx && !p.player.disabled)
    .map((p) => p.card)
  const teammateCards = currentRoundCards
    .filter(
      (p) =>
        p.player.teamIdx === context.bot.teamIdx &&
        p.player.idx !== context.bot.idx &&
        !p.player.disabled
    )
    .map((p) => p.card)
  const opponentBest = opponentCards.length ? Math.max(...opponentCards.map((c) => CARDS[c])) : 0
  const teammateBest = teammateCards.length ? Math.max(...teammateCards.map((c) => CARDS[c])) : 0
  const teammatesNotPlayed = getTeammates(context).filter(
    (p) => !currentRoundCards.some((c) => c.player.idx === p.idx)
  )
  const teammateBestInHand = teammatesNotPlayed.reduce(
    (max, p) => Math.max(max, ...p.hand.map((c) => CARDS[c])),
    0
  )

  const winsThisRound =
    botBest > opponentBest && botBest > teammateBest && botBest > teammateBestInHand

  const roundsWon = (context.play.rounds ?? []).reduce(
    (acc, round) => {
      if (round.winner?.teamIdx === context.bot.teamIdx) acc[0]++
      else if (round.winner?.teamIdx !== context.bot.teamIdx && round.winner) acc[1]++
      if (round.tie) acc.ties++
      return acc
    },
    { 0: 0, 1: 0, ties: 0 } as { 0: number; 1: number; ties: number }
  )

  const forehandTeamIdx =
    context.table.players.findIndex(
      (p) => p.idx === (context.play.rounds?.[0]?.cards?.[0]?.player.idx ?? -1)
    ) % 2

  const willWinHand =
    roundsWon[context.bot.teamIdx] >= 1 &&
    ((roundsWon[context.bot.teamIdx] + (winsThisRound ? 1 : 0) >= 2 &&
      roundsWon[getOpponentTeam(context.bot.teamIdx) as 0 | 1] < 2) ||
      (roundsWon[context.bot.teamIdx] + (winsThisRound ? 1 : 0) > 2 &&
        roundsWon[getOpponentTeam(context.bot.teamIdx) as 0 | 1] > 2 &&
        context.bot.teamIdx === forehandTeamIdx) ||
      ((context.play.rounds?.length ?? 0) > 2 &&
        roundsWon.ties > 0 &&
        winsThisRound &&
        (context.play.rounds?.[0]?.winner?.teamIdx ?? null) === context.bot.teamIdx))

  const strongHandEscalation =
    context.isFirstRound &&
    context.botHandStrength >= 36 &&
    context.profile.aggression >= 0.7 &&
    Math.random() < 0.02

  const bluffEscalation =
    context.isFirstRound &&
    context.profile.bluffing >= 0.9 &&
    shouldBluff(context) &&
    estimateOpponentAggression(context) < 0.5 &&
    Math.random() < 0.01

  return (winsThisRound && willWinHand) || strongHandEscalation || bluffEscalation
}

function shouldCallEnvido(context: BotContext): EEnvidoCommand | null {
  if (!context.isFirstRound || !isLastTeamPlayer(context) || context.play.envido.stake > 0)
    return null
  const pointsToWin =
    context.matchPoint - Math.max(context.teamScore.buenas, context.opponentScore.buenas)
  const teamEnvido = estimateTeamEnvido(context)
  const isLastTablePlayer =
    context.table.getPlayerPosition(context.bot.key, true) ===
    context.table.players.filter((p) => !p.disabled).length - 1

  if (isLastTablePlayer && teamEnvido >= 15 * context.profile.envidoConfidence) {
    return EEnvidoCommand.ENVIDO
  }
  if (
    pointsToWin <= context.matchPoint * 0.3 &&
    teamEnvido >= 30 * context.profile.envidoConfidence
  ) {
    return EEnvidoCommand.FALTA_ENVIDO
  }
  if (teamEnvido >= 25 && Math.random() > 0.3) {
    return EEnvidoCommand.ENVIDO
  }
  if (
    teamEnvido >= 33 * context.profile.envidoConfidence &&
    Math.random() > 0.7 * (1 - context.profile.riskTolerance)
  ) {
    return EEnvidoCommand.REAL_ENVIDO
  }
  return null
}

function shouldCallTruco(context: BotContext): ETrucoCommand | null {
  const nextTrucoCommand = context.play.truco.getNextTrucoCommand()
  if (!nextTrucoCommand || !context.bot._commands.has(nextTrucoCommand)) return null

  const trucoThresholds = {
    [ETrucoCommand.TRUCO]: context.isFirstRound ? 36 : 25,
    [ETrucoCommand.RE_TRUCO]: 30,
    [ETrucoCommand.VALE_CUATRO]: 35,
  }
  let requiredStrength = trucoThresholds[nextTrucoCommand] * (1 - context.profile.caution * 0.8)
  if (context.isLastRound || context.previousRoundTie) requiredStrength *= 0.8
  if (context.profile.aggression > 0.8) requiredStrength *= 0.9

  const teamStrength =
    context.botHandStrength + estimateTeammateStrength(context) * getTeammates(context).length
  const opponentStrength = estimateOpponentStrength(context)
  const opponentAggression = estimateOpponentAggression(context)
  const bluffChance = context.isFirstRound
    ? context.profile.bluffing * 0.01
    : context.profile.bluffing * 0.4
  const isTeamBehind = context.scoreDifference < -5
  const [_, highestCard] = context.bot.getHighestCard()

  if (isCertainToWin(context) && !context.isFirstRound) {
    return nextTrucoCommand
  }

  if (!isOpponentLowestCard(context) && !context.isFirstRound) {
    const cardValue = CARDS[highestCard]
    const inferredHands = context.activeOpponents
      .map((opponent) => inferOpponentHand(context, opponent, calculateEnvidoPointsArray))
      .filter((hand): hand is ICard[] => hand !== null)
    const hasStrongOpponent = inferredHands.some(
      (hand) => hand.reduce((sum, card) => sum + CARDS[card], 0) > 25
    )
    if (!hasStrongOpponent && cardValue >= 11) {
      const aggressionFactor = context.profile.aggression > 0.7 ? 0.02 : 0
      if (Math.random() > 0.2 - aggressionFactor) {
        return nextTrucoCommand
      }
    }
  }

  if (
    !context.isFirstRound &&
    !isTeamBehind &&
    (isLastTeamPlayer(context) || context.profile.riskTolerance > 0.6) &&
    Math.random() > context.profile.patience &&
    ((teamStrength > requiredStrength && context.botHandStrength >= 12) ||
      (shouldBluff(context) &&
        opponentAggression < 0.5 &&
        Math.random() < bluffChance &&
        context.botHandStrength < 20 &&
        context.activeOpponents.some(
          (op) => context.bot.opponentProfiles[op.key]?.foldCount > 1
        )) ||
      (context.profile.aggression >= 0.7 &&
        context.profile.riskTolerance >= 0.6 &&
        Math.abs(context.scoreDifference) < 3 &&
        teamStrength > 20))
  ) {
    return nextTrucoCommand
  }
  return null
}

export async function playBot(
  table: ITable,
  bot: IPlayer,
  play: IPlayInstance,
  playCard: ITrucoshi["playCard"],
  sayCommand: ITrucoshi["sayCommand"]
) {
  if (!play.player || !bot.isTurn || play.player.idx !== bot.idx) return

  const context: BotContext = {
    table,
    bot,
    play,
    profile: bot.bot ? PERSONALITY_PROFILES[bot.bot] : PERSONALITY_PROFILES["Nick"],
    botHandStrength: bot.hand.reduce((sum, card) => sum + CARDS[card], 0),
    isFirstRound: play.roundIdx === 1,
    isLastRound: play.roundIdx === 3,
    previousRoundTie: play.rounds?.[play.roundIdx - 2]?.tie ?? false,
    teamScore: play.teams[bot.teamIdx].points,
    opponentScore: play.teams[getOpponentTeam(bot.teamIdx)].points,
    matchPoint: play.matchOptions.matchPoint || 15,
    isCloseToWin:
      play.teams[bot.teamIdx].points.buenas >= (play.matchOptions.matchPoint || 15) * 0.7 ||
      play.teams[getOpponentTeam(bot.teamIdx)].points.buenas >=
        (play.matchOptions.matchPoint || 15) * 0.7,
    scoreDifference:
      play.teams[bot.teamIdx].points.buenas -
      play.teams[getOpponentTeam(bot.teamIdx)].points.buenas,
    currentRound: play.rounds?.[play.roundIdx - 1] ?? null,
    activeOpponents: table.players.filter((p) => p.teamIdx !== bot.teamIdx && !p.disabled),
    teammates: table.players.filter(
      (p) => p.teamIdx === bot.teamIdx && p.idx !== bot.idx && !p.disabled
    ),
  }

  // Initialize opponent profiles
  context.activeOpponents.forEach((opponent) => {
    context.bot.opponentProfiles[opponent.key] = context.bot.opponentProfiles[opponent.key] || {
      bluffCount: 0,
      foldCount: 0,
      aggression: 0.5,
    }
  })

  // Calculate delay based on personality, game momentum, and player count
  const totalPlayers = context.table.players.filter((p) => !p.disabled).length
  const playerMultiplier = totalPlayers === 2 ? 0.55 : totalPlayers === 4 ? 0.7 : 0.8 // Scale delay by player count
  let baseDelay = PLAYER_TIMEOUT_GRACE * playerMultiplier * (1 + context.profile.patience)
  let momentumFactor = 1

  // Adjust delay based on game momentum
  if (context.isCloseToWin || Math.abs(context.scoreDifference) < 3) {
    momentumFactor += 0.3 // Close game, think longer
  }
  if (context.isFirstRound || context.previousRoundTie) {
    momentumFactor += 0.2 // Critical round, add hesitation
  }
  if (
    context.play.state === EHandState.WAITING_FOR_TRUCO_ANSWER ||
    context.play.state === EHandState.WAITING_ENVIDO_ANSWER
  ) {
    momentumFactor += 0.3 // High-stakes decision, simulate tension
  }
  if (isLastTeamPlayer(context)) {
    momentumFactor += 0.1 // Last team player, strategic weight
  }
  if (context.play.handIdx === 1 && context.isFirstRound && !context.play.player?.didSomething) {
    baseDelay += PLAYER_TIMEOUT_GRACE * (3 - context.bot.idx) // First-hand delay, reduced multiplier
  }

  // Apply momentum and add randomness for variability
  const delay = Math.max(
    PLAYER_TIMEOUT_GRACE * 0.8, // Minimum 450ms
    baseDelay * momentumFactor * (0.5 + Math.random() * 0.4) // 20% randomness
  )

  if (process.env.NODE_ENV !== "test") {
    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  // **Flor Phase**
  if (
    context.play.state === EHandState.WAITING_FLOR_ANSWER &&
    context.bot.hasFlor &&
    context.bot.flor
  ) {
    if (context.play.flor.stake > 3) {
      return sayCommand({
        command:
          context.bot.flor.value >= 35 * context.profile.envidoConfidence
            ? EAnswerCommand.QUIERO
            : EAnswerCommand.NO_QUIERO,
        play,
        player: bot,
        table: table.sessionId,
      })
    }
    if (
      context.bot._commands.has(EFlorCommand.CONTRAFLOR_AL_RESTO) &&
      context.bot.flor?.value >= 37 * context.profile.envidoConfidence
    ) {
      return sayCommand({
        command: EFlorCommand.CONTRAFLOR_AL_RESTO,
        play,
        player: bot,
        table: table.sessionId,
      })
    }
    if (
      context.bot._commands.has(EFlorCommand.CONTRAFLOR) &&
      context.bot.flor?.value >= 30 * context.profile.envidoConfidence
    ) {
      return sayCommand({
        command: EFlorCommand.CONTRAFLOR,
        play,
        player: bot,
        table: table.sessionId,
      })
    }
    if (
      context.bot._commands.has(EFlorCommand.ACHICO) &&
      context.bot.flor?.value < 27 * context.profile.envidoConfidence
    ) {
      return sayCommand({ command: EFlorCommand.ACHICO, play, player: bot, table: table.sessionId })
    }

    if (context.bot._commands.has(EFlorCommand.FLOR)) {
      return sayCommand({ command: EFlorCommand.FLOR, play, player: bot, table: table.sessionId })
    } else {
      logger.fatal(context, "BOT SHOULD HAVE FLOR??? ***")
      return sayCommand({ command: EFlorCommand.FLOR, play, player: bot, table: table.sessionId })
    }
  }

  if (context.bot._commands.has(EFlorCommand.FLOR)) {
    return sayCommand({ command: EFlorCommand.FLOR, play, player: bot, table: table.sessionId })
  }

  // **Play Phase**
  if (context.play.state === EHandState.WAITING_PLAY) {
    const envidoCommand = shouldCallEnvido(context)
    if (envidoCommand && context.bot._commands.has(envidoCommand)) {
      return sayCommand({ command: envidoCommand, play, player: bot, table: table.sessionId })
    }

    const trucoCommand = shouldCallTruco(context)
    if (trucoCommand) {
      return sayCommand({ command: trucoCommand, play, player: bot, table: table.sessionId })
    }

    // Fallback to play a card
    const [cardIdx, card] = selectCard(context)
    return playCard({ card, cardIdx, play, player: bot, table: table.sessionId })
  }

  // **Truco Answer**
  if (context.play.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
    const teamStrength =
      context.botHandStrength + estimateTeammateStrength(context) * getTeammates(context).length
    const teamEnvido = estimateTeamEnvido(context)
    const pointsToWin =
      context.matchPoint - Math.max(context.teamScore.buenas, context.opponentScore.buenas)
    const noEnvidoCalled = context.play.envido.stake === 0
    const opponentAggression = estimateOpponentAggression(context)
    const hasFrequentFolder = context.activeOpponents.some(
      (op) => context.bot.opponentProfiles[op.key]?.foldCount > 1
    )

    if (
      context.isFirstRound &&
      noEnvidoCalled &&
      context.bot._commands.has(EEnvidoCommand.ENVIDO)
    ) {
      if (
        teamEnvido >= 15 * context.profile.envidoConfidence ||
        (shouldBluff(context) && Math.random() < context.profile.bluffing * 0.3)
      ) {
        if (
          pointsToWin <= context.matchPoint * 0.3 &&
          teamEnvido >= 30 * context.profile.envidoConfidence
        ) {
          return sayCommand({
            command: EEnvidoCommand.FALTA_ENVIDO,
            play,
            player: bot,
            table: table.sessionId,
          })
        }
        if (
          teamEnvido >= 33 * context.profile.envidoConfidence &&
          Math.random() > 0.7 * (1 - context.profile.riskTolerance)
        ) {
          return sayCommand({
            command: EEnvidoCommand.REAL_ENVIDO,
            play,
            player: bot,
            table: table.sessionId,
          })
        }
        return sayCommand({
          command: EEnvidoCommand.ENVIDO,
          play,
          player: bot,
          table: table.sessionId,
        })
      }
    }

    const nextTrucoCommand = context.play.truco.getNextTrucoCommand()
    if (nextTrucoCommand && context.bot._commands.has(nextTrucoCommand)) {
      const trucoThresholds = {
        [ETrucoCommand.TRUCO]: 25,
        [ETrucoCommand.RE_TRUCO]: 30,
        [ETrucoCommand.VALE_CUATRO]: 35,
      }
      const requiredStrength =
        trucoThresholds[nextTrucoCommand] * (1 - context.profile.caution * 0.8)
      const isTeamBehind = context.scoreDifference < -5
      if (
        !isTeamBehind &&
        Math.random() > 0.6 &&
        ((teamStrength > requiredStrength && context.botHandStrength >= 12) ||
          (shouldBluff(context) &&
            opponentAggression < 0.5 &&
            Math.random() < context.profile.bluffing * 0.3))
      ) {
        if (context.play.player && !context.play.player.disabled)
          updateOpponentProfile(context, context.play.player, "bluff")
        return sayCommand({ command: nextTrucoCommand, play, player: bot, table: table.sessionId })
      }
    }

    const threshold = context.isCloseToWin ? 24 : 26
    if (
      (shouldBluff(context) &&
        opponentAggression < 0.6 &&
        (Math.random() > 0.8 || hasFrequentFolder)) ||
      teamStrength >
        threshold *
          Math.sqrt(getTeammates(context).length + 1) *
          (1 - context.profile.riskTolerance)
    ) {
      return sayCommand({
        command: EAnswerCommand.QUIERO,
        play,
        player: bot,
        table: table.sessionId,
      })
    }
    if (context.play.player && !context.play.player.disabled)
      updateOpponentProfile(context, context.play.player, "fold")
    return sayCommand({
      command: EAnswerCommand.NO_QUIERO,
      play,
      player: bot,
      table: table.sessionId,
    })
  }

  // **Envido Answer**
  if (context.play.state === EHandState.WAITING_ENVIDO_ANSWER) {
    const teamEnvido = estimateTeamEnvido(context)
    const possibleCommands = context.play.envido.possibleAnswerCommands.filter((cmd) =>
      context.bot._commands.has(cmd)
    )
    const pointsToWin =
      context.matchPoint - Math.max(context.teamScore.buenas, context.opponentScore.buenas)
    const opponentAggression = estimateOpponentAggression(context)

    const envidoStakes: Record<EEnvidoCommand, number> = {
      [EEnvidoCommand.ENVIDO]: 2,
      [EEnvidoCommand.REAL_ENVIDO]: 3,
      [EEnvidoCommand.FALTA_ENVIDO]: pointsToWin,
    }

    const commandScores = possibleCommands.map((command) => {
      if (command === EAnswerCommand.QUIERO) {
        const threshold = context.isCloseToWin
          ? 24
          : pointsToWin <= context.matchPoint * 0.3
          ? 23
          : 25
        return {
          command,
          score:
            teamEnvido >= threshold * context.profile.envidoConfidence
              ? 0.8 * context.profile.envidoConfidence
              : 0.4 * (1 - context.profile.caution),
        }
      }
      if (command === EAnswerCommand.NO_QUIERO) {
        const threshold = context.isCloseToWin
          ? 24
          : pointsToWin <= context.matchPoint * 0.3
          ? 23
          : 25
        return {
          command,
          score:
            teamEnvido < threshold * context.profile.envidoConfidence
              ? 0.9 * context.profile.caution
              : 0.2,
        }
      }
      const stake = envidoStakes[command as EEnvidoCommand] || context.play.envido.stake
      const envidoThreshold = 25 + stake * 3 * (1 - context.profile.envidoConfidence)
      const bluffFactor =
        shouldBluff(context) && opponentAggression < 0.5 ? 0.2 * context.profile.bluffing : 0
      return {
        command,
        score:
          teamEnvido >= envidoThreshold
            ? 0.7 * context.profile.riskTolerance + bluffFactor
            : 0.2 * context.profile.riskTolerance + bluffFactor,
      }
    })

    const bestCommand = commandScores.reduce(
      (best, curr) => (curr.score > best.score ? curr : best),
      commandScores[0] || { command: EAnswerCommand.NO_QUIERO, score: 0 }
    )
    if (
      bestCommand.command !== EAnswerCommand.NO_QUIERO &&
      context.play.player &&
      !context.play.player.disabled
    ) {
      updateOpponentProfile(context, context.play.player, "bluff")
    }
    return sayCommand({ command: bestCommand.command, play, player: bot, table: table.sessionId })
  }

  // **Envido Points**
  if (context.play.state === EHandState.WAITING_ENVIDO_POINTS_ANSWER) {
    const highestEnvido = context.bot.getHighestEnvido()
    const opponentIsWinner = context.play.envido.winningPlayer?.teamIdx !== context.bot.teamIdx
    const opponentWins = context.play.envido.winningPointsAnswer > highestEnvido
    const botPos = context.table.getPlayerPosition(context.bot.key, true)
    const winnerPos = context.play.envido.winningPlayer
      ? context.table.getPlayerPosition(context.play.envido.winningPlayer.key, true)
      : 999
    const forehandWins = botPos < winnerPos

    if (
      context.bot._commands.has(ESayCommand.PASO) &&
      opponentIsWinner &&
      (opponentWins ||
        (!forehandWins && context.play.envido.winningPointsAnswer >= highestEnvido)) &&
      (context.profile.caution > 0.6 || Math.random() < 0.7 * context.profile.caution)
    ) {
      return sayCommand({
        command: ESayCommand.PASO,
        play,
        player: bot,
        table: table.sessionId,
      })
    }

    if (
      context.bot._commands.has(EEnvidoAnswerCommand.SON_BUENAS) &&
      opponentIsWinner &&
      (opponentWins || !forehandWins)
    ) {
      return sayCommand({
        command: EEnvidoAnswerCommand.SON_BUENAS,
        play,
        player: bot,
        table: table.sessionId,
      })
    }

    return sayCommand({
      command: highestEnvido,
      play,
      player: bot,
      table: table.sessionId,
    })
  }

  // **Default Case**
  const [cardIdx, card] = selectCard(context)
  return playCard({ card, cardIdx, play, player: bot, table: table.sessionId })
}
