import { expect } from "chai"
import { DEFAULT_TUTORIAL_SCENARIO_ID, getTutorialScenario } from "../../src/tutorials"
import { BOT_NAMES, NORMAL_BOT_NAMES } from "../../src/truco/Bot"
import { EFlorCommand } from "../../src/types"

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
    expect(scenario.hands).to.have.lengthOf(6)
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
      text: "Excelente. Ahora intenta ganarme el resto del partido sin ayuda.",
    })
  })

  it("keeps Profe Truco out of regular bot matchmaking", () => {
    expect(BOT_NAMES).to.include("ProfeTruco")
    expect(NORMAL_BOT_NAMES).not.to.include("ProfeTruco")
  })
})
