import { expect } from "chai"
import { getTreasureEligibleAccountIds } from "../../src/server/services/TreasureEligibility"

const player = (overrides: {
  accountId?: number | null
  abandoned?: boolean
  bot?: string | false
  teamIdx: 0 | 1
}) => ({
  accountId: overrides.accountId,
  abandoned: overrides.abandoned || false,
  bot: overrides.bot || false,
  teamIdx: overrides.teamIdx,
})

describe("Treasure eligibility", () => {
  it("credits logged-in humans with a human opponent even when bots are present", () => {
    const accountIds = getTreasureEligibleAccountIds([
      player({ accountId: 1, teamIdx: 0 }),
      player({ accountId: 2, teamIdx: 1 }),
      player({ bot: "Bot 1", teamIdx: 0 }),
      player({ bot: "Bot 2", teamIdx: 1 }),
    ])

    expect(accountIds).to.deep.equal([1, 2])
  })

  it("does not credit solo human versus bots", () => {
    const accountIds = getTreasureEligibleAccountIds([
      player({ accountId: 1, teamIdx: 0 }),
      player({ bot: "Bot 1", teamIdx: 1 }),
    ])

    expect(accountIds).to.deep.equal([])
  })

  it("does not credit abandoned, guest, or bot players themselves", () => {
    const accountIds = getTreasureEligibleAccountIds([
      player({ accountId: 1, abandoned: true, teamIdx: 0 }),
      player({ teamIdx: 0 }),
      player({ bot: "Bot 1", teamIdx: 0 }),
      player({ accountId: 2, teamIdx: 1 }),
    ])

    expect(accountIds).to.deep.equal([2])
  })

  it("credits each account only once per match", () => {
    const accountIds = getTreasureEligibleAccountIds([
      player({ accountId: 1, teamIdx: 0 }),
      player({ accountId: 1, teamIdx: 0 }),
      player({ accountId: 2, teamIdx: 1 }),
    ])

    expect(accountIds).to.deep.equal([1, 2])
  })
})
