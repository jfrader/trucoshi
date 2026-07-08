import {
  CARDS,
  EAnswerCommand,
  EEnvidoAnswerCommand,
  EEnvidoCommand,
  EFlorCommand,
  EHandState,
  ESayCommand,
  ETrucoCommand,
  ICard,
  IPlayedCard,
  ITutorialBotAction,
  ITutorialHand,
  ITutorialMessage,
  ITutorialMessageTrigger,
  ITutorialScenario,
  TutorialScenarioId,
} from "../types"
import type { IRound } from "../truco/Round"
import basicTrucoV1 from "./basic-truco-v1.json"

export const DEFAULT_TUTORIAL_SCENARIO_ID: TutorialScenarioId = "basic-truco-v1"
export const TUTORIAL_ROUND_RESULT_TOKEN = "{{roundResult}}"
export const TUTORIAL_PREVIOUS_ROUND_SCORE_TOKEN = "{{previousRoundScore}}"

const SUIT_NAMES: Record<string, string> = {
  e: "espada",
  b: "basto",
  o: "oro",
  c: "copa",
}

const CARD_NUMBER_NAMES: Record<string, string> = {
  r: "12",
  c: "11",
  p: "10",
}

const getTutorialCardName = (card: ICard) => {
  if (card === "1e") {
    return "ancho de espada"
  }
  if (card === "1b") {
    return "ancho de basto"
  }

  const suit = card.slice(-1)
  const number = card.slice(0, -1)
  const cardNumber = CARD_NUMBER_NAMES[number] ?? number
  const suitName = SUIT_NAMES[suit] ?? suit
  return `${cardNumber} de ${suitName}`
}

export const renderTutorialRoundResult = (playedCards: IPlayedCard[]): string | null => {
  if (playedCards.length !== 2) {
    return null
  }

  const humanCard = playedCards.find((playedCard) => !playedCard.player.bot)
  const botCard = playedCards.find((playedCard) => playedCard.player.bot)
  if (!humanCard || !botCard) {
    return null
  }

  const humanValue = CARDS[humanCard.card]
  const botValue = CARDS[botCard.card]
  if (humanValue === undefined || botValue === undefined) {
    return null
  }

  const humanName = getTutorialCardName(humanCard.card)
  const botName = getTutorialCardName(botCard.card)

  if (humanValue > botValue) {
    return `Ganaste la ronda: tu ${humanName} le gana al ${botName} del Profe.`
  }

  if (botValue > humanValue) {
    return `Gano el Profe: su ${botName} le gana a tu ${humanName}.`
  }

  return `Parda: tu ${humanName} y el ${botName} tienen la misma fuerza.`
}

export const renderTutorialPreviousRoundScore = (rounds: IRound[] | undefined): string | null => {
  const completedRounds = (rounds ?? []).filter((round) => round.cards.length >= 2)
  if (!completedRounds.length) {
    return null
  }

  const score = completedRounds.reduce(
    (current, round) => {
      if (round.tie) {
        current.ties += 1
        return current
      }
      if (round.winner?.bot) {
        current.bot += 1
        return current
      }
      if (round.winner) {
        current.human += 1
      }
      return current
    },
    { human: 0, bot: 0, ties: 0 }
  )

  if (score.human === 1 && score.bot === 1 && score.ties === 0) {
    return "Van una ronda ganada cada uno."
  }
  if (score.human === 1 && score.bot === 0 && score.ties === 0) {
    return "Venis con una ronda ganada."
  }
  if (score.bot === 1 && score.human === 0 && score.ties === 0) {
    return "El Profe viene con una ronda ganada."
  }
  if (score.ties === 1 && score.human === 0 && score.bot === 0) {
    return "La primera fue parda."
  }

  return "Las rondas anteriores dejaron la mano abierta."
}

export const renderTutorialMessageText = (
  text: string,
  roundCards: IPlayedCard[] | undefined,
  previousRounds?: IRound[]
): string | null => {
  let renderedText = text

  if (renderedText.includes(TUTORIAL_ROUND_RESULT_TOKEN)) {
    const roundResult = roundCards ? renderTutorialRoundResult(roundCards) : null
    if (!roundResult) {
      return null
    }
    renderedText = renderedText.split(TUTORIAL_ROUND_RESULT_TOKEN).join(roundResult)
  }

  if (renderedText.includes(TUTORIAL_PREVIOUS_ROUND_SCORE_TOKEN)) {
    const previousRoundScore = renderTutorialPreviousRoundScore(previousRounds)
    if (!previousRoundScore) {
      return null
    }
    renderedText = renderedText
      .split(TUTORIAL_PREVIOUS_ROUND_SCORE_TOKEN)
      .join(previousRoundScore)
  }

  return renderedText
}

const MESSAGE_TRIGGERS: ITutorialMessageTrigger[] = [
  "hand_start",
  "before_human_turn",
  "after_human_action",
  "before_bot_action",
  "after_bot_action",
  "hand_end",
]

const COMMANDS = new Set<string>([
  ...Object.values(ESayCommand),
  ...Object.values(ETrucoCommand),
  ...Object.values(EAnswerCommand),
  ...Object.values(EEnvidoCommand),
  ...Object.values(EEnvidoAnswerCommand),
  ...Object.values(EFlorCommand),
])

const HAND_STATES = new Set<string>(Object.values(EHandState))

const isCard = (value: unknown): value is ICard =>
  typeof value === "string" && value in CARDS

const isCommand = (value: unknown): value is string =>
  typeof value === "string" && COMMANDS.has(value)

const assertValidActionValue = (value: unknown, context: string) => {
  if (typeof value === "number") {
    return
  }

  if (isCard(value) || isCommand(value)) {
    return
  }

  throw new Error(`${context} has invalid action value: ${String(value)}`)
}

const validateCardList = (value: unknown, context: string) => {
  if (!Array.isArray(value) || value.some((card) => !isCard(card))) {
    throw new Error(`${context} must be a list of valid card ids`)
  }
}

const validateMessage = (message: ITutorialMessage, context: string) => {
  if (!MESSAGE_TRIGGERS.includes(message.trigger)) {
    throw new Error(`${context} has invalid trigger: ${message.trigger}`)
  }
  if (typeof message.text !== "string" || !message.text.trim()) {
    throw new Error(`${context} must contain text`)
  }
  if (message.text.length > 155) {
    throw new Error(`${context} text is longer than 155 characters`)
  }
  if (message.state && !HAND_STATES.has(message.state)) {
    throw new Error(`${context} has invalid state: ${message.state}`)
  }
  if (message.actionValue !== undefined) {
    assertValidActionValue(message.actionValue, context)
  }
  if (message.roundComplete !== undefined && typeof message.roundComplete !== "boolean") {
    throw new Error(`${context} has invalid roundComplete`)
  }
  if (
    message.roundCardCount !== undefined &&
    (!Number.isInteger(message.roundCardCount) || message.roundCardCount < 0)
  ) {
    throw new Error(`${context} has invalid roundCardCount`)
  }
  if (message.requiresHandCards !== undefined) {
    validateCardList(message.requiresHandCards, `${context} requiresHandCards`)
  }
  if (message.requiresRoundCards !== undefined) {
    validateCardList(message.requiresRoundCards, `${context} requiresRoundCards`)
  }
}

const validateBotAction = (botAction: ITutorialBotAction, context: string) => {
  if (botAction.trigger !== "before_bot_action") {
    throw new Error(`${context} has invalid trigger: ${botAction.trigger}`)
  }
  if (botAction.state && !HAND_STATES.has(botAction.state)) {
    throw new Error(`${context} has invalid state: ${botAction.state}`)
  }
  if (!["card", "command"].includes(botAction.action?.type)) {
    throw new Error(`${context} has invalid action type`)
  }
  if (botAction.action.type === "card" && !isCard(botAction.action.value)) {
    throw new Error(`${context} card action must use a valid card id`)
  }
  if (botAction.action.type === "command" && !isCommand(botAction.action.value) && typeof botAction.action.value !== "number") {
    throw new Error(`${context} command action must use a valid command`)
  }
}

const validateHand = (hand: ITutorialHand, handIdx: number) => {
  if (typeof hand.goal !== "string" || !hand.goal.trim()) {
    throw new Error(`Tutorial hand ${handIdx} must have a goal`)
  }

  const usedCards = new Set<ICard>()
  for (const [playerIdx, cards] of Object.entries(hand.cardsByPlayerIdx || {})) {
    if (!Number.isInteger(Number(playerIdx))) {
      throw new Error(`Tutorial hand ${handIdx} has invalid player index: ${playerIdx}`)
    }
    if (!Array.isArray(cards) || cards.length !== 3) {
      throw new Error(`Tutorial hand ${handIdx} player ${playerIdx} must have exactly 3 cards`)
    }
    for (const card of cards) {
      if (!isCard(card)) {
        throw new Error(`Tutorial hand ${handIdx} has invalid card: ${String(card)}`)
      }
      if (usedCards.has(card)) {
        throw new Error(`Tutorial hand ${handIdx} has duplicate card: ${card}`)
      }
      usedCards.add(card)
    }
  }

  hand.messages.forEach((message, index) =>
    validateMessage(message, `Tutorial hand ${handIdx} message ${index}`)
  )
  hand.botActions.forEach((botAction, index) =>
    validateBotAction(botAction, `Tutorial hand ${handIdx} bot action ${index}`)
  )
}

export const validateTutorialScenario = (scenario: ITutorialScenario): ITutorialScenario => {
  if (!scenario.id || !scenario.title || !scenario.botProfile || !scenario.botName) {
    throw new Error("Tutorial scenario must define id, title, botProfile, and botName")
  }
  if (scenario.options.maxPlayers !== 2) {
    throw new Error("Tutorial v1 scenarios must be 1v1")
  }
  if (!Array.isArray(scenario.hands) || !scenario.hands.length) {
    throw new Error(`Tutorial scenario ${scenario.id} must include hands`)
  }

  scenario.hands.forEach((hand, index) => validateHand(hand, index + 1))

  return scenario
}

export const TUTORIAL_SCENARIOS: Record<TutorialScenarioId, ITutorialScenario> = {
  [basicTrucoV1.id]: validateTutorialScenario(basicTrucoV1 as unknown as ITutorialScenario),
}

export const getTutorialScenario = (
  id: TutorialScenarioId | null | undefined = DEFAULT_TUTORIAL_SCENARIO_ID
): ITutorialScenario => {
  const scenarioId = id ?? DEFAULT_TUTORIAL_SCENARIO_ID
  const scenario = TUTORIAL_SCENARIOS[scenarioId]
  if (!scenario) {
    throw new Error(`Tutorial scenario not found: ${scenarioId}`)
  }
  return scenario
}
