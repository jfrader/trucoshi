import { randomUUID } from "crypto"
import {
  EAnswerCommand,
  ECommand,
  EEnvidoAnswerCommand,
  EFlorCommand,
  EHandState,
  EMatchState,
  ESayCommand,
  ICard,
  IChatMessage,
  IChatRoom,
  IPlayer,
  ITeam,
  ITutorialBotAction,
  ITutorialMessageTrigger,
  ITutorialRuntime,
  TutorialScenarioId,
} from "../../types"
import { IPlayInstance } from "../../truco"
import {
  DEFAULT_TUTORIAL_SCENARIO_ID,
  getTutorialScenario,
  renderTutorialMessageText,
  TUTORIAL_PREVIOUS_ROUND_SCORE_TOKEN,
  TUTORIAL_ROUND_RESULT_TOKEN,
} from "../../tutorials"
import logger from "../../utils/logger"
import { IMatchTable } from "./MatchTable"
import { IUserSession, UserSession } from "./UserSession"
import type { ITrucoshi, TrucoshiSocket } from "./Trucoshi"
import type { RemoteSocket } from "socket.io"
import type { ServerToClientEvents } from "../../events"

const log = logger.child({ class: "Tutorial" })

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type TutorialSocket = TrucoshiSocket | RemoteSocket<ServerToClientEvents, any>

export class Tutorial {
  static readonly TURN_TIMEOUT_MS = 24 * 60 * 60 * 1000

  private static readonly INITIAL_MESSAGE_DELAY_MS = 350
  private static readonly MESSAGE_GAP_MS = 3600
  private static readonly POST_ACTION_PAUSE_MS = 1200
  private static readonly BOT_RESPONSE_DELAY_MS = 1800

  static createRuntime(scenarioId?: TutorialScenarioId | null): ITutorialRuntime {
    const scenario = getTutorialScenario(scenarioId ?? DEFAULT_TUTORIAL_SCENARIO_ID)

    return {
      scenario,
      sentMessageKeys: new Set(),
      executedActionKeys: new Set(),
      messageQueue: Promise.resolve(),
      hasQueuedMessage: false,
      inputLocked: false,
      messageGeneration: 0,
    }
  }

  static async createMatch(
    server: ITrucoshi,
    input: {
      userSession: IUserSession
      socket: TutorialSocket
      tutorialId?: TutorialScenarioId | null
    }
  ): Promise<IMatchTable> {
    const scenarioId = input.tutorialId ?? DEFAULT_TUTORIAL_SCENARIO_ID
    const existingTable = server.tables.find(
      (table) =>
        table.tutorial?.scenario.id === scenarioId &&
        table.state() !== EMatchState.FINISHED &&
        Boolean(table.isSessionPlaying(input.userSession.session))
    )

    if (existingTable) {
      input.socket.join(existingTable.matchSessionId)
      input.socket.data.matches?.add(existingTable.matchSessionId)
      await server.emitMatchUpdate(existingTable)
      return existingTable
    }

    const runtime = Tutorial.createRuntime(scenarioId)
    const { scenario } = runtime
    const table = await server.createMatchTable(input.userSession, input.socket, {
      ...scenario.options,
      turnTime: Tutorial.TURN_TIMEOUT_MS,
      abandonTime: Tutorial.TURN_TIMEOUT_MS,
      isPrivate: true,
      tutorial: runtime,
    })

    const bot = await table.lobby.addPlayer({
      key: randomUUID(),
      name: scenario.botName,
      session: randomUUID(),
      isOwner: false,
      bot: scenario.botProfile,
      teamIdx: 1,
    })

    const botSession = UserSession(bot.key, bot.name, bot.session)
    server.sessions.set(bot.session, botSession)

    await server.setMatchPlayerReady({
      matchSessionId: table.matchSessionId,
      ready: true,
      userSession: input.userSession,
      emitChat: false,
    })
    await server.setMatchPlayerReady({
      matchSessionId: table.matchSessionId,
      ready: true,
      userSession: botSession,
      emitChat: false,
    })

    await server.startMatch({
      identityJwt: input.socket.data.identity || null,
      matchSessionId: table.matchSessionId,
      userSession: input.userSession,
    })

    return table
  }

  static isHumanInputLocked(table: IMatchTable, player: IPlayer): boolean {
    return Boolean(table.tutorial?.inputLocked && !player.bot)
  }

  static getBot(table: IMatchTable): IPlayer | null {
    const profile = table.tutorial?.scenario.botProfile
    if (!profile) {
      return null
    }
    return table.lobby.players.find((player) => player.bot === profile) || null
  }

  static matchesStep(
    step: {
      trigger: ITutorialMessageTrigger
      roundIdx?: number
      state?: EHandState
      playerIdx?: number
      actionValue?: ECommand | ICard | number
      roundComplete?: boolean
      roundCardCount?: number
      requiresHandCards?: ICard[]
      requiresRoundCards?: ICard[]
    },
    input: {
      trigger: ITutorialMessageTrigger
      play?: IPlayInstance
      actionValue?: ECommand | ICard | number
    }
  ) {
    if (step.trigger !== input.trigger) {
      return false
    }
    if (step.roundIdx !== undefined && step.roundIdx !== input.play?.roundIdx) {
      return false
    }
    if (step.state !== undefined && step.state !== input.play?.state) {
      return false
    }
    if (step.playerIdx !== undefined && step.playerIdx !== input.play?.player?.idx) {
      return false
    }
    if (step.actionValue !== undefined && step.actionValue !== input.actionValue) {
      return false
    }
    if (step.roundComplete !== undefined) {
      const roundIdx = step.roundIdx ?? input.play?.roundIdx
      const roundCards = roundIdx ? input.play?.getHand().rounds[roundIdx - 1]?.cards : undefined
      const isRoundComplete = (roundCards?.length ?? 0) >= 2
      if (step.roundComplete !== isRoundComplete) {
        return false
      }
    }
    if (step.roundCardCount !== undefined) {
      const roundIdx = step.roundIdx ?? input.play?.roundIdx
      const roundCards = roundIdx ? input.play?.getHand().rounds[roundIdx - 1]?.cards : undefined
      if ((roundCards?.length ?? 0) !== step.roundCardCount) {
        return false
      }
    }
    if (step.requiresHandCards?.length) {
      const humanPlayer = input.play?.teams
        .flatMap((team) => team.players)
        .find((player) => !player.bot)
      if (!humanPlayer || !step.requiresHandCards.every((card) => humanPlayer.hand.includes(card))) {
        return false
      }
    }
    if (step.requiresRoundCards?.length) {
      const roundIdx = step.roundIdx ?? input.play?.roundIdx
      const roundCards = roundIdx ? input.play?.getHand().rounds[roundIdx - 1]?.cards : undefined
      const playedCards = roundCards?.map((playedCard) => playedCard.card) ?? []
      if (!step.requiresRoundCards.every((card) => playedCards.includes(card))) {
        return false
      }
    }
    return true
  }

  private static enqueueMessage(
    runtime: ITutorialRuntime,
    chat: IChatRoom,
    user: IChatMessage["user"],
    message: string,
    trigger: ITutorialMessageTrigger,
    messageGeneration: number,
    tutorialContext: string
  ) {
    const delay = runtime.hasQueuedMessage
      ? Tutorial.MESSAGE_GAP_MS
      : Tutorial.INITIAL_MESSAGE_DELAY_MS
    runtime.hasQueuedMessage = true
    runtime.messageQueue = runtime.messageQueue
      .then(async () => {
        if (runtime.messageGeneration !== messageGeneration) {
          return
        }
        await sleep(delay)
        if (runtime.messageGeneration !== messageGeneration) {
          return
        }
        chat.tutorial(user, message, "botvoice", tutorialContext)
        if (trigger === "after_bot_action" || trigger === "after_human_action") {
          await sleep(Tutorial.POST_ACTION_PAUSE_MS)
        }
      })
      .catch((e) => {
        log.warn({ message: (e as Error)?.message }, "Tutorial message queue failed")
      })

    return runtime.messageQueue
  }

  private static getMessageContext(
    trigger: ITutorialMessageTrigger,
    play?: IPlayInstance,
    handIdx = play?.handIdx,
    actionValue?: ECommand | ICard | number
  ) {
    return [
      handIdx || "match",
      play?.roundIdx || 0,
      play?.state || "none",
      play?.player?.idx ?? "none",
      trigger,
      actionValue ?? "none",
    ].join(":")
  }

  private static advanceMessageGeneration(runtime: ITutorialRuntime) {
    runtime.messageGeneration += 1
    runtime.hasQueuedMessage = false
    runtime.messageQueue = Promise.resolve()
    return runtime.messageGeneration
  }

  static async emitMessages(
    server: ITrucoshi,
    table: IMatchTable,
    trigger: ITutorialMessageTrigger,
    play?: IPlayInstance,
    actionValue?: ECommand | ICard | number,
    handIdx = play?.handIdx,
    messageGeneration = table.tutorial?.messageGeneration
  ) {
    const runtime = table.tutorial
    if (!runtime || !handIdx || messageGeneration === undefined) {
      return
    }

    const hand = runtime.scenario.hands[handIdx - 1]
    const bot = Tutorial.getBot(table)
    const chat = server.chat.rooms.get(table.matchSessionId)
    if (!hand || !bot || !chat) {
      return
    }

    hand.messages.forEach((message, messageIdx) => {
      const messageKey = `${handIdx}:${messageIdx}`
      if (runtime.sentMessageKeys.has(messageKey)) {
        return
      }
      if (!Tutorial.matchesStep(message, { trigger, play, actionValue })) {
        return
      }

      const roundIdx = message.roundIdx ?? play?.roundIdx
      const handRounds = play?.getHand().rounds
      const roundCards = roundIdx ? handRounds?.[roundIdx - 1]?.cards : undefined
      const previousRounds = roundIdx ? handRounds?.slice(0, roundIdx - 1) : undefined
      const renderedText = renderTutorialMessageText(message.text, roundCards, previousRounds)
      if (!renderedText) {
        if (
          message.text.includes(TUTORIAL_ROUND_RESULT_TOKEN) ||
          message.text.includes(TUTORIAL_PREVIOUS_ROUND_SCORE_TOKEN)
        ) {
          log.warn(
            { handIdx, messageIdx, roundIdx, trigger },
            "Skipping tutorial message with unresolved runtime text"
          )
        }
        return
      }

      runtime.sentMessageKeys.add(messageKey)
      const tutorialContext = Tutorial.getMessageContext(trigger, play, handIdx, actionValue)
      Tutorial.enqueueMessage(
        runtime,
        chat,
        { name: bot.name, key: bot.key, teamIdx: bot.teamIdx },
        renderedText,
        trigger,
        messageGeneration,
        tutorialContext
      )
    })

    await runtime.messageQueue
  }

  static async setInputLocked(server: ITrucoshi, table: IMatchTable, inputLocked: boolean) {
    if (!table.tutorial || table.tutorial.inputLocked === inputLocked) {
      return
    }
    table.tutorial.inputLocked = inputLocked
    await server.emitMatchUpdate(table)
  }

  static async emitHumanDecisionIntro(server: ITrucoshi, table: IMatchTable, play: IPlayInstance) {
    if (!table.tutorial) {
      return
    }

    await Tutorial.setInputLocked(server, table, true)
    await table.tutorial.messageQueue
    const messageGeneration = Tutorial.advanceMessageGeneration(table.tutorial)
    await Tutorial.emitMessages(
      server,
      table,
      "hand_start",
      play,
      undefined,
      undefined,
      messageGeneration
    )
    await Tutorial.emitMessages(
      server,
      table,
      "before_human_turn",
      play,
      undefined,
      undefined,
      messageGeneration
    )
    table.tutorial.inputLocked = false
  }

  static emitMatchEndMessage(table: IMatchTable, chat: IChatRoom, winner: ITeam) {
    if (!table.tutorial) {
      return
    }

    const bot = Tutorial.getBot(table)
    if (!bot) {
      return
    }

    const humanWon = winner.players.some((player) => !player.bot && !player.abandoned)
    const content = humanWon
      ? "Felicitaciones, me ganaste. Ya podes jugar partidas reales."
      : "Buen intento. Ya tenes la base: volve a probar y me ganas la proxima."

    chat.tutorial(
      { name: bot.name, key: bot.key, teamIdx: bot.teamIdx },
      content,
      "botvoice",
      `match:end:${humanWon ? "win" : "loss"}`
    )
  }

  private static getMatchingBotActions(
    table: IMatchTable,
    play: IPlayInstance
  ): Array<{ key: string; action: ITutorialBotAction }> {
    const runtime = table.tutorial
    if (!runtime) {
      return []
    }

    const hand = runtime.scenario.hands[play.handIdx - 1]
    if (!hand) {
      return []
    }

    return hand.botActions
      .map((action, actionIdx) => ({ key: `${play.handIdx}:bot:${actionIdx}`, action }))
      .filter(({ key, action }) => {
        if (runtime.executedActionKeys.has(key)) {
          return false
        }
        return Tutorial.matchesStep(action, { trigger: "before_bot_action", play })
      })
  }

  private static async tryBotAction(
    table: IMatchTable,
    play: IPlayInstance,
    action: ITutorialBotAction,
    playCard: ITrucoshi["playCard"],
    sayCommand: ITrucoshi["sayCommand"]
  ) {
    const player = play.player
    if (!player) {
      return false
    }

    if (action.action.type === "card") {
      const card = action.action.value as ICard
      const cardIdx = player.hand.findIndex((current) => current === card)
      if (cardIdx === -1 || play.state !== EHandState.WAITING_PLAY) {
        return false
      }
      await playCard({ table, play, player, cardIdx, card })
      return true
    }

    const command = action.action.value as ECommand | number
    if (typeof command === "number") {
      if (play.state !== EHandState.WAITING_ENVIDO_POINTS_ANSWER) {
        return false
      }
    } else if (!player.commands.includes(command)) {
      return false
    }
    await sayCommand({ table, play, player, command })
    return true
  }

  private static async playBotFallback(
    table: IMatchTable,
    play: IPlayInstance,
    playCard: ITrucoshi["playCard"],
    sayCommand: ITrucoshi["sayCommand"]
  ) {
    const player = play.player
    if (!player) {
      return
    }

    if (play.state === EHandState.WAITING_PLAY && player.hand.length) {
      const [cardIdx, card] = player.getLowestCard()
      await playCard({ table, play, player, cardIdx, card })
      return
    }

    if (play.state === EHandState.WAITING_ENVIDO_POINTS_ANSWER) {
      await sayCommand({ table, play, player, command: player.getHighestEnvido() || 0 })
      return
    }

    const preferredCommands: Array<ECommand> = [
      EAnswerCommand.QUIERO,
      EEnvidoAnswerCommand.SON_BUENAS,
      EFlorCommand.FLOR,
      ESayCommand.PASO,
      EAnswerCommand.NO_QUIERO,
      ESayCommand.MAZO,
    ]
    const command = preferredCommands.find((candidate) => player.commands.includes(candidate))
    if (command) {
      await sayCommand({ table, play, player, command })
    }
  }

  static async playBot(
    server: ITrucoshi,
    table: IMatchTable,
    play: IPlayInstance,
    playCard: ITrucoshi["playCard"],
    sayCommand: ITrucoshi["sayCommand"]
  ) {
    void Tutorial.emitMessages(server, table, "hand_start", play)
    await Tutorial.emitMessages(server, table, "before_bot_action", play)
    await sleep(Tutorial.BOT_RESPONSE_DELAY_MS)

    const runtime = table.tutorial
    if (!runtime) {
      return Tutorial.playBotFallback(table, play, playCard, sayCommand)
    }

    for (const { key, action } of Tutorial.getMatchingBotActions(table, play)) {
      try {
        const didAct = await Tutorial.tryBotAction(table, play, action, playCard, sayCommand)
        if (didAct) {
          runtime.executedActionKeys.add(key)
          void Tutorial.emitMessages(server, table, "after_bot_action", play, action.action.value)
          return
        }
      } catch (e) {
        table.log.warn(
          { message: (e as Error)?.message, action },
          "Tutorial bot action failed, falling back"
        )
      }
    }

    await Tutorial.playBotFallback(table, play, playCard, sayCommand)
    void Tutorial.emitMessages(server, table, "after_bot_action", play)
  }
}
