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
  ITutorialBotAction,
  ITutorialHand,
  ITutorialMessage,
  ITutorialMessageTrigger,
  ITutorialScenario,
  TutorialScenarioId,
} from "../types"
import basicTrucoV1 from "./basic-truco-v1.json"

export const DEFAULT_TUTORIAL_SCENARIO_ID: TutorialScenarioId = "basic-truco-v1"

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

const validateMessage = (message: ITutorialMessage, context: string) => {
  if (!MESSAGE_TRIGGERS.includes(message.trigger)) {
    throw new Error(`${context} has invalid trigger: ${message.trigger}`)
  }
  if (typeof message.text !== "string" || !message.text.trim()) {
    throw new Error(`${context} must contain text`)
  }
  if (message.text.length > 120) {
    throw new Error(`${context} text is longer than 120 characters`)
  }
  if (message.state && !HAND_STATES.has(message.state)) {
    throw new Error(`${context} has invalid state: ${message.state}`)
  }
  if (message.actionValue !== undefined) {
    assertValidActionValue(message.actionValue, context)
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
