import { expect } from "chai"
import sinon from "sinon"
import {
  DEFAULT_TUTORIAL_SCENARIO_ID,
  getTutorialScenario,
  renderTutorialPreviousRoundScore,
  renderTutorialRoundResult,
} from "../../src/tutorials"
import { Tutorial } from "../../src/server/classes/Tutorial"
import { BOT_NAMES, NORMAL_BOT_NAMES } from "../../src/truco/Bot"
import { IRound } from "../../src/truco/Round"
import { EFlorCommand, EHandState, ICard, IPlayedCard, IPlayer, ITeam } from "../../src/types"

const playedCard = (idx: number, card: ICard, bot = false): IPlayedCard => ({
  key: `${card}${idx}`,
  card,
  player: {
    idx,
    key: `player-${idx}`,
    name: bot ? "Profe Truco" : "Tutorial Player",
    bot: bot ? "ProfeTruco" : null,
  } as IPlayedCard["player"],
})

const tutorialPlayer = (idx: number, hand: ICard[], bot = false): IPlayer =>
  ({
    idx,
    key: `player-${idx}`,
    name: bot ? "Profe Truco" : "Tutorial Player",
    bot: bot ? "ProfeTruco" : null,
    teamIdx: idx as 0 | 1,
    hand,
  }) as IPlayer

const tutorialTeam = (idx: 0 | 1, players: IPlayer[]): ITeam =>
  ({
    id: idx,
    players,
  }) as ITeam

describe("Tutorial scenarios", () => {
  it("loads the default tutorial scenario with flor enabled", () => {
    const scenario = getTutorialScenario()

    expect(scenario.id).to.equal(DEFAULT_TUTORIAL_SCENARIO_ID)
    expect(scenario.title).to.equal("Aprende a jugar")
    expect(scenario.botProfile).to.equal("ProfeTruco")
    expect(scenario.options).to.include({
      maxPlayers: 2,
      matchPoint: 9,
      flor: true,
      satsPerPlayer: 0,
    })
    expect(scenario.hands).to.have.lengthOf(9)
    expect(scenario.hands[0].messages[0].text).to.include("9 buenas")
  })

  it("treats null scenario id as the default tutorial", () => {
    const scenario = getTutorialScenario(null)

    expect(scenario.id).to.equal(DEFAULT_TUTORIAL_SCENARIO_ID)
  })

  it("includes a scripted flor lesson for the human player", () => {
    const scenario = getTutorialScenario(DEFAULT_TUTORIAL_SCENARIO_ID)
    const florHand = scenario.hands.find((hand) => hand.goal.includes("Flor"))

    expect(florHand).to.exist
    expect(florHand?.cardsByPlayerIdx["0"]).to.deep.equal(["7o", "6o", "1o"])
    const teachesFlorCommand = florHand?.messages.some(
      (message) => message.actionValue === EFlorCommand.FLOR
    )
    expect(teachesFlorCommand).to.be.true
  })

  it("ends the scripted lesson with a continuation message", () => {
    const scenario = getTutorialScenario(DEFAULT_TUTORIAL_SCENARIO_ID)
    const lastHand = scenario.hands.at(-1)

    expect(lastHand?.messages).to.deep.include({
      trigger: "hand_end",
      text: "Frenar a tiempo tambien es jugar bien. Ahora intenta cerrar el partido sin ayuda.",
    })
  })

  it("renders a human round win with card names", () => {
    const result = renderTutorialRoundResult([
      playedCard(0, "1e"),
      playedCard(1, "3c", true),
    ])

    expect(result).to.equal(
      "Ganaste la ronda: tu ancho de espada le gana al 3 de copa del Profe."
    )
  })

  it("renders a Profe round win with card names", () => {
    const result = renderTutorialRoundResult([
      playedCard(0, "4c"),
      playedCard(1, "3c", true),
    ])

    expect(result).to.equal("Gano el Profe: su 3 de copa le gana a tu 4 de copa.")
  })

  it("renders a parda with card names", () => {
    const result = renderTutorialRoundResult([
      playedCard(0, "3e"),
      playedCard(1, "3o", true),
    ])

    expect(result).to.equal("Parda: tu 3 de espada y el 3 de oro tienen la misma fuerza.")
  })

  it("renders the previous round score for a one-one third round", () => {
    const humanRound = {
      cards: [playedCard(0, "1e"), playedCard(1, "3c", true)],
      tie: false,
      winner: playedCard(0, "1e").player,
    } as IRound
    const botRound = {
      cards: [playedCard(0, "4c"), playedCard(1, "3o", true)],
      tie: false,
      winner: playedCard(1, "3o", true).player,
    } as IRound

    expect(renderTutorialPreviousRoundScore([humanRound, botRound])).to.equal(
      "Van una ronda ganada cada uno."
    )
  })

  it("renders the previous round score for a first-round parda", () => {
    const pardaRound = {
      cards: [playedCard(0, "3e"), playedCard(1, "3o", true)],
      tie: true,
      winner: null,
    } as IRound

    expect(renderTutorialPreviousRoundScore([pardaRound])).to.equal("La primera fue parda.")
  })

  it("matches requiresHandCards only while the human still has those cards", () => {
    const human = tutorialPlayer(0, ["7o", "1b"])
    const bot = tutorialPlayer(1, ["3o"], true)
    const play = {
      teams: [tutorialTeam(0, [human]), tutorialTeam(1, [bot])],
      roundIdx: 2,
      state: EHandState.WAITING_PLAY,
      getHand: () => ({ rounds: [{ cards: [] }, { cards: [playedCard(1, "3o", true)] }] }),
    } as any

    expect(
      Tutorial.matchesStep(
        {
          trigger: "before_human_turn",
          roundIdx: 2,
          requiresHandCards: ["7o", "1b"],
        },
        { trigger: "before_human_turn", play }
      )
    ).to.equal(true)

    human.hand = ["1b"]

    expect(
      Tutorial.matchesStep(
        {
          trigger: "before_human_turn",
          roundIdx: 2,
          requiresHandCards: ["7o", "1b"],
        },
        { trigger: "before_human_turn", play }
      )
    ).to.equal(false)
  })

  it("does not cancel an after-action flor message when the human turn continues", async () => {
    const clock = sinon.useFakeTimers()
    const messages: Array<{ message: string; context: string }> = []
    const runtime = Tutorial.createRuntime(DEFAULT_TUTORIAL_SCENARIO_ID)
    const human = tutorialPlayer(0, ["7o", "6o", "1o"])
    const bot = tutorialPlayer(1, ["4e", "5b", "rc"], true)
    const play = {
      handIdx: 8,
      roundIdx: 1,
      state: EHandState.WAITING_PLAY,
      player: human,
      teams: [tutorialTeam(0, [human]), tutorialTeam(1, [bot])],
      getHand: () => ({ rounds: [{ cards: [] }] }),
    } as any
    const table = {
      tutorial: runtime,
      matchSessionId: "tutorial-flor",
      lobby: { players: [human, bot] },
    } as any
    const server = {
      chat: {
        rooms: {
          get: () => ({
            tutorial: (_user: unknown, message: string, _voice: string, context: string) => {
              messages.push({ message, context })
            },
          }),
        },
      },
      emitMatchUpdate: async () => undefined,
    } as any

    try {
      const afterAction = Tutorial.emitMessages(
        server,
        table,
        "after_human_action",
        play,
        EFlorCommand.FLOR
      )
      const nextIntro = Tutorial.emitHumanDecisionIntro(server, table, play)

      await clock.tickAsync(350)

      expect(messages[0]).to.deep.include({
        message: "Flor cantada. Ahora tira el 7 de oro para marcar la cancha.",
      })

      await clock.tickAsync(10000)
      await Promise.all([afterAction, nextIntro])
    } finally {
      clock.restore()
    }
  })

  it("keeps tutorial copy concrete and guarded", () => {
    const scenario = getTutorialScenario(DEFAULT_TUTORIAL_SCENARIO_ID)
    const messages = scenario.hands.flatMap((hand) => hand.messages)
    const blockedPhrases = [
      "si hay carta en mesa",
      "ya no hay mucho misterio",
      "lo que paso antes",
      "mira que carta te queda",
      "trata de ganar",
    ]

    expect(messages.filter((message) => message.text.length > 120)).to.deep.equal([])
    blockedPhrases.forEach((phrase) => {
      expect(messages.some((message) => message.text.includes(phrase))).to.equal(false)
    })
    expect(
      messages.some(
        (message) =>
          message.trigger === "after_human_action" &&
          message.text.includes("{{roundResult}}") &&
          message.roundComplete !== true
      )
    ).to.equal(false)
  })

  it("keeps Profe Truco out of regular bot matchmaking", () => {
    expect(BOT_NAMES).to.include("ProfeTruco")
    expect(NORMAL_BOT_NAMES).not.to.include("ProfeTruco")
  })
})
