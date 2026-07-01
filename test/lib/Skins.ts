import { expect } from "chai"
import { CARD_SKINS, INVENTORY_GRANT_RELEASES, SKIN_RELEASES } from "../../src/lib/Skins"

describe("Card skin registry", () => {
  it("loads skin releases from json", () => {
    expect(SKIN_RELEASES).to.have.length(1)
    expect(SKIN_RELEASES[0].release).to.equal("argentino")
    expect(SKIN_RELEASES[0].grantOnInventory).to.equal(false)
    expect(SKIN_RELEASES[0].grantSource).to.equal(undefined)
    expect(SKIN_RELEASES[0].skins).to.have.length(16)
  })

  it("flattens all configured skins", () => {
    expect(CARD_SKINS).to.have.length(16)
    expect(CARD_SKINS).to.deep.equal(SKIN_RELEASES[0].skins)
  })

  it("uses json-configured inventory grants", () => {
    expect(INVENTORY_GRANT_RELEASES).to.have.length(0)
    expect(CARD_SKINS.every((skin) => !("name" in skin))).to.equal(true)
  })
})
