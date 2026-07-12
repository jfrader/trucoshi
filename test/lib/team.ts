import { expect } from "chai"
import { DEFAULT_TEAM_NAMES, getDefaultTeamName } from "../../src/lib"
import { Team } from "../../src/truco"

describe("Team", () => {
  it("uses centralized default names", () => {
    expect(DEFAULT_TEAM_NAMES).to.deep.equal({ 0: "Naranja", 1: "Violeta" })
    expect(getDefaultTeamName(0)).to.equal("Naranja")
    expect(getDefaultTeamName(1)).to.equal("Violeta")
    expect(Team(0).name).to.equal("Naranja")
    expect(Team(1).name).to.equal("Violeta")
  })

  it("keeps explicit and subsequently customized names", () => {
    expect(Team(0, "Los Cracks").name).to.equal("Los Cracks")
    expect(Team(1).setName("Las Bestias").name).to.equal("Las Bestias")
  })
})
