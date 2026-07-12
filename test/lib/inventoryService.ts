import { expect } from "chai"
import { InventoryService } from "../../src/server/services/InventoryService"
import { ICardSkin } from "../../src/types"

type FakeCardSkin = ICardSkin & {
  description: string | null
  createdAt?: Date
  updatedAt?: Date
}

function createFakeStore(extraSkins: FakeCardSkin[] = []) {
  const cardSkins = new Map<string, FakeCardSkin>()
  const userSkins = new Map<
    string,
    { accountId: number; cardSkinId: string; source?: string; quantity: number }
  >()
  const deckCards = new Map<string, { accountId: number; card: string; cardSkinId: string }>()

  for (const skin of extraSkins) {
    cardSkins.set(skin.id, skin)
  }

  return {
    cardSkin: {
      async upsert({ where, create, update }: any) {
        const existing = cardSkins.get(where.id)
        const row = {
          ...(existing || {}),
          ...(existing ? update : create),
          description: (existing ? update.description : create.description) || null,
        }

        cardSkins.set(where.id, row)
        return row
      },
      async findMany({ where, select }: any = {}) {
        let rows = Array.from(cardSkins.values())

        if (where?.enabled !== undefined) {
          rows = rows.filter((skin) => skin.enabled === where.enabled)
        }

        if (where?.release !== undefined) {
          rows = rows.filter((skin) => skin.release === where.release)
        }
        if (where?.unlockable !== undefined) {
          rows = rows.filter((skin) => skin.unlockable === where.unlockable)
        }
        if (where?.rarity !== undefined) {
          rows = rows.filter((skin) => skin.rarity === where.rarity)
        }
        if (where?.id?.in) {
          rows = rows.filter((skin) => where.id.in.includes(skin.id))
        }

        rows = rows.sort((a, b) =>
          `${a.card}:${a.release}:${a.id}`.localeCompare(`${b.card}:${b.release}:${b.id}`)
        )

        if (select?.id) {
          return rows.map((skin) => ({ id: skin.id }))
        }

        return rows
      },
      async findUnique({ where }: any) {
        return cardSkins.get(where.id) || null
      },
    },
    userCardSkin: {
      async findMany({ where, select }: any) {
        let rows = Array.from(userSkins.values()).filter((skin) => skin.accountId === where.accountId)

        if (where?.cardSkinId?.in) {
          rows = rows.filter((skin) => where.cardSkinId.in.includes(skin.cardSkinId))
        }
        if (where?.quantity !== undefined) {
          rows = rows.filter((skin) => skin.quantity === where.quantity)
        }

        if (select?.cardSkinId || select?.quantity) {
          return rows.map((skin) => ({
            ...(select.cardSkinId ? { cardSkinId: skin.cardSkinId } : {}),
            ...(select.quantity ? { quantity: skin.quantity } : {}),
          }))
        }

        return rows
      },
      async findUnique({ where }: any) {
        return userSkins.get(`${where.accountId_cardSkinId.accountId}:${where.accountId_cardSkinId.cardSkinId}`) || null
      },
      async upsert({ where, create, update }: any) {
        const key = `${where.accountId_cardSkinId.accountId}:${where.accountId_cardSkinId.cardSkinId}`
        const existing = userSkins.get(key)
        const row = {
          ...(existing || create),
          ...update,
          quantity: existing
            ? existing.quantity + (update.quantity?.increment || 0)
            : create.quantity || 1,
        }
        userSkins.set(key, row)
        return row
      },
      async updateMany({ where, data }: any) {
        const key = `${where.accountId}:${where.cardSkinId}`
        const existing = userSkins.get(key)
        if (!existing || existing.quantity < (where.quantity?.gte || 0)) {
          return { count: 0 }
        }
        userSkins.set(key, {
          ...existing,
          quantity: existing.quantity - (data.quantity?.decrement || 0),
        })
        return { count: 1 }
      },
      async deleteMany({ where }: any) {
        for (const [key, row] of userSkins) {
          if (
            row.accountId === where.accountId &&
            (!where.cardSkinId?.in || where.cardSkinId.in.includes(row.cardSkinId)) &&
            (where.quantity === undefined || row.quantity === where.quantity)
          ) {
            userSkins.delete(key)
          }
        }
      },
    },
    userDeckCard: {
      async findMany({ where, include, select }: any) {
        const rows = Array.from(deckCards.values()).filter((deck) => deck.accountId === where.accountId)

        if (include?.cardSkin) {
          return rows.map((deck) => ({
            ...deck,
            cardSkin: cardSkins.get(deck.cardSkinId),
          }))
        }

        if (select?.card || select?.cardSkinId) {
          return rows.map((deck) => ({
            card: deck.card,
            cardSkinId: deck.cardSkinId,
          }))
        }

        return rows
      },
      async deleteMany({ where }: any) {
        for (const [key, row] of deckCards) {
          if (
            row.accountId === where.accountId &&
            (where.card === undefined || row.card === where.card) &&
            (!where.cardSkinId?.in || where.cardSkinId.in.includes(row.cardSkinId))
          ) {
            deckCards.delete(key)
          }
        }
      },
      async upsert({ where, create, update }: any) {
        const key = `${where.accountId_card.accountId}:${where.accountId_card.card}`
        const row = { ...(deckCards.get(key) || create), ...update }
        deckCards.set(key, row)
        return row
      },
    },
    userSkinRoll: {
      async create({ data }: any) {
        return { id: 1, ...data }
      },
    },
    async $transaction(fn: any) {
      return fn(this)
    },
    __rows: { userSkins, deckCards },
  } as any
}

describe("InventoryService", () => {
  it("returns configured inventory without skin names or automatic grants", async () => {
    const inventory = await InventoryService(createFakeStore()).getInventory(1)
    const oneB = inventory.find((group) => group.card === "1b")

    expect(oneB?.skins).to.have.length(2)
    expect(oneB?.skins.every((skin) => !skin.unlocked)).to.equal(true)
    expect(oneB?.skins[0]).not.to.have.property("name")
  })

  it("equips and clears one card skin", async () => {
    const service = InventoryService(createFakeStore())

    await service.seedInitialCardSkins()
    await service.grantSkin(1, "argentino/1b_argentino_001", "test")
    await service.setDeckCardSkin(1, "1b", "argentino/1b_argentino_001")
    expect(await service.getEffectiveDeck(1)).to.deep.equal({
      "1b": "argentino/1b_argentino_001",
    })

    const inventory = await service.getInventory(1)
    expect(inventory.find((group) => group.card === "1b")?.equippedCardSkinId).to.equal(
      "argentino/1b_argentino_001"
    )

    await service.setDeckCardSkin(1, "1b", null)
    expect(await service.getEffectiveDeck(1)).to.deep.equal({})
  })

  it("rejects skins for a different card", async () => {
    const service = InventoryService(createFakeStore())

    try {
      await service.setDeckCardSkin(1, "1e", "argentino/1b_argentino_001")
      throw new Error("Expected setDeckCardSkin to fail")
    } catch (e) {
      expect((e as Error).message).to.equal("Card skin does not match card")
    }
  })

  it("rejects enabled skins that are not owned", async () => {
    const service = InventoryService(
      createFakeStore([
        {
          id: "future/1b_future_001",
          release: "future",
          card: "1b",
          description: null,
          fileName: "1b_future_001.png",
          assetPath: "web/releases/future/1b_future_001.png",
          rarity: "PROMO",
          enabled: true,
          unlockable: true,
        },
      ])
    )

    try {
      await service.setDeckCardSkin(1, "1b", "future/1b_future_001")
      throw new Error("Expected setDeckCardSkin to fail")
    } catch (e) {
      expect((e as Error).message).to.equal("Card skin is locked")
    }
  })

  it("stores duplicate quantities and rolls five common copies into one rare skin", async () => {
    const store = createFakeStore()
    const service = InventoryService(store, (_max) => 0)
    const commonId = "argentino/1b_argentino_001"

    await service.seedInitialCardSkins()
    for (let i = 0; i < 5; i += 1) {
      await service.grantSkin(1, commonId, "test")
    }
    await service.setDeckCardSkin(1, "1b", commonId)

    expect(
      (await service.getInventory(1))
        .find((group) => group.card === "1b")
        ?.skins.find((skin) => skin.id === commonId)?.quantity
    ).to.equal(5)

    const result = await service.rollSkins(1, Array(5).fill(commonId))

    expect(result.inputRarity).to.equal("COMMON")
    expect(result.outputRarity).to.equal("RARE")
    expect(result.rewardedSkin.rarity).to.equal("RARE")
    expect(store.__rows.userSkins.get(`1:${commonId}`)).to.equal(undefined)
    expect(store.__rows.userSkins.get(`1:${result.rewardedSkin.id}`)?.quantity).to.equal(1)
    expect(await service.getEffectiveDeck(1)).to.deep.equal({})
  })

  it("rejects mixed-rarity rolls before consuming anything", async () => {
    const store = createFakeStore()
    const service = InventoryService(store, (_max) => 0)
    const commonId = "argentino/1b_argentino_001"
    const rareId = "argentino/1b_argentino_002"

    await service.seedInitialCardSkins()
    for (let i = 0; i < 4; i += 1) {
      await service.grantSkin(1, commonId, "test")
    }
    await service.grantSkin(1, rareId, "test")

    try {
      await service.rollSkins(1, [commonId, commonId, commonId, commonId, rareId])
      throw new Error("Expected rollSkins to fail")
    } catch (e) {
      expect((e as Error).message).to.equal("All card skins must have the same rarity")
    }

    expect(store.__rows.userSkins.get(`1:${commonId}`)?.quantity).to.equal(4)
    expect(store.__rows.userSkins.get(`1:${rareId}`)?.quantity).to.equal(1)
  })
})
