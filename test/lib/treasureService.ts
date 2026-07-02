import { expect } from "chai"
import { CARD_SKINS } from "../../src/lib/Skins"
import { TREASURE_CONFIG } from "../../src/lib/Treasures"
import { TreasureService } from "../../src/server/services/TreasureService"
import { ICardSkin } from "../../src/types"

type FakeCardSkin = ICardSkin & {
  description: string | null
}

const toFakeSkin = (skin: ICardSkin): FakeCardSkin => ({
  ...skin,
  description: skin.description || null,
})

function createFakeStore(randomSkins: FakeCardSkin[] = CARD_SKINS.map(toFakeSkin)) {
  const cardSkins = new Map(randomSkins.map((skin) => [skin.id, skin]))
  const userSkins = new Map<string, { accountId: number; cardSkinId: string; source?: string }>()
  const progress = new Map<number, { id: number; accountId: number; progress: number }>()
  const credits = new Map<string, { id: number; accountId: number; matchId: number }>()
  const chests = new Map<
    number,
    {
      id: number
      accountId: number
      sourceMatchId: number | null
      earnedAt: Date
      openedAt: Date | null
      rolledRarity: string | null
      cardSkinId: string | null
      duplicate: boolean
    }
  >()
  let nextId = 1

  return {
    cardSkin: {
      async findMany({ where }: any = {}) {
        return Array.from(cardSkins.values())
          .filter((skin) => where?.enabled === undefined || skin.enabled === where.enabled)
          .filter((skin) => where?.unlockable === undefined || skin.unlockable === where.unlockable)
          .filter((skin) => where?.rarity === undefined || skin.rarity === where.rarity)
          .sort((a, b) => a.id.localeCompare(b.id))
      },
    },
    userCardSkin: {
      async findUnique({ where }: any) {
        return (
          userSkins.get(
            `${where.accountId_cardSkinId.accountId}:${where.accountId_cardSkinId.cardSkinId}`
          ) || null
        )
      },
      async upsert({ where, create, update }: any) {
        const key = `${where.accountId_cardSkinId.accountId}:${where.accountId_cardSkinId.cardSkinId}`
        const row = { ...(userSkins.get(key) || create), ...update }
        userSkins.set(key, row)
        return row
      },
    },
    userTreasureProgress: {
      async findUnique({ where }: any) {
        return progress.get(where.accountId) || null
      },
      async upsert({ where, create, update }: any) {
        const row = {
          ...(progress.get(where.accountId) || { id: nextId++, ...create }),
          ...update,
        }
        progress.set(where.accountId, row)
        return row
      },
    },
    userTreasureMatchCredit: {
      async create({ data }: any) {
        const key = `${data.accountId}:${data.matchId}`
        if (credits.has(key)) {
          throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
        }
        const row = { id: nextId++, ...data }
        credits.set(key, row)
        return row
      },
    },
    userTreasureChest: {
      async create({ data }: any) {
        const row = {
          id: nextId++,
          accountId: data.accountId,
          sourceMatchId: data.sourceMatchId || null,
          earnedAt: new Date(),
          openedAt: null,
          rolledRarity: null,
          cardSkinId: null,
          duplicate: false,
        }
        chests.set(row.id, row)
        return row
      },
      async findMany({ where }: any) {
        return Array.from(chests.values())
          .filter((chest) => chest.accountId === where.accountId)
          .filter((chest) => (where.openedAt === null ? !chest.openedAt : true))
          .sort((a, b) => a.id - b.id)
      },
      async findUnique({ where }: any) {
        return chests.get(where.id) || null
      },
      async updateMany({ where, data }: any) {
        const existing = chests.get(where.id)
        if (
          !existing ||
          existing.accountId !== where.accountId ||
          (where.openedAt === null && existing.openedAt)
        ) {
          return { count: 0 }
        }

        chests.set(existing.id, { ...existing, ...data })
        return { count: 1 }
      },
      async update({ where, data }: any) {
        const existing = chests.get(where.id)
        if (!existing) {
          throw new Error("Not found")
        }
        const row = { ...existing, ...data }
        chests.set(where.id, row)
        return row
      },
    },
    async $transaction(fn: any) {
      return fn(this)
    },
    __rows: {
      userSkins,
      chests,
    },
  } as any
}

describe("Treasure config", () => {
  it("uses conservative rarity odds and a 3-match threshold", () => {
    expect(TREASURE_CONFIG.eligibleMatchesPerChest).to.equal(3)
    expect(TREASURE_CONFIG.rarityWeights).to.deep.equal({
      COMMON: 70,
      RARE: 22,
      EPIC: 7,
      LEGENDARY: 1,
      PROMO: 0,
    })
  })
})

describe("TreasureService", () => {
  it("creates one chest after every third credited match", async () => {
    const service = TreasureService(createFakeStore())

    expect(await service.creditEligibleMatch(1, 101)).to.include({ progress: 1, threshold: 3 })
    expect(await service.creditEligibleMatch(1, 102)).to.include({ progress: 2, threshold: 3 })
    const status = await service.creditEligibleMatch(1, 103)

    expect(status.progress).to.equal(0)
    expect(status.unopenedChests).to.have.length(1)
    expect(status.unopenedChests[0].sourceMatchId).to.equal(103)
  })

  it("does not double count the same match credit", async () => {
    const service = TreasureService(createFakeStore())

    await service.creditEligibleMatch(1, 101)
    const status = await service.creditEligibleMatch(1, 101)

    expect(status.progress).to.equal(1)
    expect(status.unopenedChests).to.have.length(0)
  })

  it("opens a chest and grants an unowned rolled skin", async () => {
    const service = TreasureService(createFakeStore(), (_max) => 0)

    await service.creditEligibleMatch(1, 101)
    await service.creditEligibleMatch(1, 102)
    const status = await service.creditEligibleMatch(1, 103)
    const result = await service.openChest(1, status.unopenedChests[0].id)

    expect(result.rarity).to.equal("COMMON")
    expect(result.granted).to.equal(true)
    expect(result.duplicate).to.equal(false)
    expect(result.cardSkin?.rarity).to.equal("COMMON")
    expect((await service.getTreasureStatus(1)).unopenedChests).to.have.length(0)
  })

  it("grants a dev chest without match progress", async () => {
    const service = TreasureService(createFakeStore())
    const status = await service.grantDevChest(1)

    expect(status.progress).to.equal(0)
    expect(status.unopenedChests).to.have.length(1)
    expect(status.unopenedChests[0].sourceMatchId).to.equal(null)
  })

  it("opens duplicate rewards without granting a second copy", async () => {
    const store = createFakeStore()
    const service = TreasureService(store, (_max) => 0)

    await service.creditEligibleMatch(1, 101)
    await service.creditEligibleMatch(1, 102)
    const first = await service.creditEligibleMatch(1, 103)
    await service.openChest(1, first.unopenedChests[0].id)

    await service.creditEligibleMatch(1, 104)
    await service.creditEligibleMatch(1, 105)
    const second = await service.creditEligibleMatch(1, 106)
    const result = await service.openChest(1, second.unopenedChests[0].id)

    expect(result.rarity).to.equal("COMMON")
    expect(result.granted).to.equal(false)
    expect(result.duplicate).to.equal(true)
  })

  it("only allows one concurrent open for the same chest", async () => {
    const store = createFakeStore()
    const service = TreasureService(store, (_max) => 0)

    await service.creditEligibleMatch(1, 101)
    await service.creditEligibleMatch(1, 102)
    const status = await service.creditEligibleMatch(1, 103)
    const chestId = status.unopenedChests[0].id
    const results = await Promise.allSettled([
      service.openChest(1, chestId),
      service.openChest(1, chestId),
    ])

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof service.openChest>>> =>
        result.status === "fulfilled"
    )
    const rejected = results.filter((result) => result.status === "rejected")

    expect(fulfilled).to.have.length(1)
    expect(rejected).to.have.length(1)
    expect(fulfilled[0].value.granted).to.equal(true)
    expect(store.__rows.userSkins.size).to.equal(1)
    expect((await service.getTreasureStatus(1)).unopenedChests).to.have.length(0)
  })

  it("opens empty when a rarity has no configured skins", async () => {
    const service = TreasureService(createFakeStore([]), (_max) => 0)

    await service.creditEligibleMatch(1, 101)
    await service.creditEligibleMatch(1, 102)
    const status = await service.creditEligibleMatch(1, 103)
    const result = await service.openChest(1, status.unopenedChests[0].id)

    expect(result.rarity).to.equal("COMMON")
    expect(result.cardSkin).to.equal(null)
    expect(result.granted).to.equal(false)
    expect(result.duplicate).to.equal(false)
  })
})
