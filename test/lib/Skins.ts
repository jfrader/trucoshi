import { expect } from "chai"
import { CARD_SKINS, INVENTORY_GRANT_RELEASES, SKIN_RELEASES } from "../../src/lib/Skins"
import { CARDS } from "../../src/lib/constants"

describe("Card skin registry", () => {
  it("loads skin releases from json", () => {
    expect(SKIN_RELEASES).to.have.length(1)
    expect(SKIN_RELEASES[0].release).to.equal("argentino")
    expect(SKIN_RELEASES[0].grantOnInventory).to.equal(false)
    expect(SKIN_RELEASES[0].grantSource).to.equal(undefined)
    expect(SKIN_RELEASES[0].skins).to.not.be.empty
  })

  it("flattens all configured skins", () => {
    const configuredSkins = SKIN_RELEASES.flatMap((release) => release.skins)

    expect(CARD_SKINS).to.have.length(configuredSkins.length)
    expect(CARD_SKINS).to.deep.equal(SKIN_RELEASES[0].skins)
  })

  it("uses json-configured inventory grants", () => {
    expect(INVENTORY_GRANT_RELEASES).to.have.length(0)
    expect(CARD_SKINS.every((skin) => !("name" in skin))).to.equal(true)
  })

  it("uses unique skin ids and valid cards", () => {
    const ids = CARD_SKINS.map((skin) => skin.id)
    const uniqueIds = new Set(ids)
    const validCards = new Set(Object.keys(CARDS))

    expect(uniqueIds.size).to.equal(ids.length)
    expect(CARD_SKINS.every((skin) => validCards.has(skin.card))).to.equal(true)
  })
})
