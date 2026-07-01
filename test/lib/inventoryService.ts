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
  const userSkins = new Map<string, { accountId: number; cardSkinId: string; source?: string }>()
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
        const rows = Array.from(userSkins.values()).filter((skin) => skin.accountId === where.accountId)

        if (select?.cardSkinId) {
          return rows.map((skin) => ({ cardSkinId: skin.cardSkinId }))
        }

        return rows
      },
      async findUnique({ where }: any) {
        return userSkins.get(`${where.accountId_cardSkinId.accountId}:${where.accountId_cardSkinId.cardSkinId}`) || null
      },
      async upsert({ where, create, update }: any) {
        const key = `${where.accountId_cardSkinId.accountId}:${where.accountId_cardSkinId.cardSkinId}`
        const row = { ...(userSkins.get(key) || create), ...update }
        userSkins.set(key, row)
        return row
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
        deckCards.delete(`${where.accountId}:${where.card}`)
      },
      async upsert({ where, create, update }: any) {
        const key = `${where.accountId_card.accountId}:${where.accountId_card.card}`
        const row = { ...(deckCards.get(key) || create), ...update }
        deckCards.set(key, row)
        return row
      },
    },
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
          assetPath: "skins/future/1b_future_001.png",
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
})
