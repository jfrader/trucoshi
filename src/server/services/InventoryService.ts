import { Prisma, PrismaClient } from "@prisma/client"
import { CARD_SKINS, INVENTORY_GRANT_RELEASES } from "../../lib/Skins"
import { CARDS } from "../../lib/constants"
import { createRandomIndexPicker, RandomIndexPicker } from "../../lib/classes/Random"
import {
  CardSkinRarity,
  CardSkinId,
  ICard,
  ICardSkin,
  IEquippedDeck,
  IInventoryCardGroup,
  IInventoryCardSkin,
  ISkinRollResult,
} from "../../types"

type Store = PrismaClient | Prisma.TransactionClient

const allCards = Object.keys(CARDS) as ICard[]

const isCard = (card: string): card is ICard => card in CARDS

export const SKIN_ROLL_COST = 5

const NEXT_ROLL_RARITY: Partial<Record<CardSkinRarity, CardSkinRarity>> = {
  COMMON: "RARE",
  RARE: "EPIC",
  EPIC: "LEGENDARY",
  LEGENDARY: "LEGENDARY",
}

const toCardSkin = (skin: {
  id: string
  release: string
  card: string
  description: string | null
  fileName: string
  assetPath: string
  rarity: string
  enabled: boolean
  unlockable: boolean
}): ICardSkin => ({
  id: skin.id,
  release: skin.release,
  card: skin.card as ICard,
  description: skin.description,
  fileName: skin.fileName,
  assetPath: skin.assetPath,
  rarity: skin.rarity as ICardSkin["rarity"],
  enabled: skin.enabled,
  unlockable: skin.unlockable,
})

export interface IInventoryService {
  seedInitialCardSkins(): Promise<void>
  getInventory(accountId: number): Promise<IInventoryCardGroup[]>
  getEffectiveDeck(accountId?: number): Promise<IEquippedDeck>
  setDeckCardSkin(
    accountId: number,
    card: ICard,
    cardSkinId: CardSkinId | null
  ): Promise<void>
  grantSkin(accountId: number, cardSkinId: CardSkinId, source?: string): Promise<void>
  grantRelease(accountId: number, release: string, source?: string): Promise<void>
  rollSkins(accountId: number, cardSkinIds: CardSkinId[]): Promise<ISkinRollResult>
}

export function InventoryService(
  store: Store,
  random: RandomIndexPicker = createRandomIndexPicker("skin-roll-service")
): IInventoryService {
  const runInTransaction = async <T>(fn: (tx: Store) => Promise<T>): Promise<T> => {
    if ("$transaction" in store && typeof store.$transaction === "function") {
      return store.$transaction((tx) => fn(tx))
    }

    return fn(store)
  }

  const grantInventoryReleases = async (accountId: number) => {
    for (const release of INVENTORY_GRANT_RELEASES) {
      await service.grantRelease(accountId, release.release, release.grantSource)
    }
  }

  const service: IInventoryService = {
    async seedInitialCardSkins() {
      for (const skin of CARD_SKINS) {
        await store.cardSkin.upsert({
          where: { id: skin.id },
          create: skin,
          update: {
            release: skin.release,
            card: skin.card,
            description: skin.description,
            fileName: skin.fileName,
            assetPath: skin.assetPath,
            rarity: skin.rarity,
            enabled: skin.enabled,
            unlockable: skin.unlockable,
          },
        })
      }
    },
    async getInventory(accountId) {
      await service.seedInitialCardSkins()
      await grantInventoryReleases(accountId)

      const [skins, unlocked, deckRows] = await Promise.all([
        store.cardSkin.findMany({
          where: { enabled: true },
          orderBy: [{ card: "asc" }, { release: "asc" }, { id: "asc" }],
        }),
        store.userCardSkin.findMany({
          where: { accountId },
          select: { cardSkinId: true, quantity: true },
        }),
        store.userDeckCard.findMany({
          where: { accountId },
          select: { card: true, cardSkinId: true },
        }),
      ])

      const quantityById = new Map(unlocked.map((skin) => [skin.cardSkinId, skin.quantity]))
      const equippedByCard = deckRows.reduce<Record<string, string>>((acc, row) => {
        acc[row.card] = row.cardSkinId
        return acc
      }, {})

      const grouped = allCards.reduce<Record<ICard, IInventoryCardGroup>>((acc, card) => {
        acc[card] = {
          card,
          skins: [],
          equippedCardSkinId: equippedByCard[card],
        }
        return acc
      }, {} as Record<ICard, IInventoryCardGroup>)

      for (const skin of skins) {
        if (!isCard(skin.card)) {
          continue
        }

        const definition = toCardSkin(skin)
        const inventorySkin: IInventoryCardSkin = {
          ...definition,
          unlocked: (quantityById.get(skin.id) || 0) > 0,
          equipped: equippedByCard[skin.card] === skin.id,
          quantity: quantityById.get(skin.id) || 0,
        }

        grouped[definition.card].skins.push(inventorySkin)
      }

      return allCards.map((card) => grouped[card])
    },
    async getEffectiveDeck(accountId) {
      if (!accountId) {
        return {}
      }

      const [deckRows, unlocked] = await Promise.all([
        store.userDeckCard.findMany({
          where: { accountId },
          include: { cardSkin: true },
        }),
        store.userCardSkin.findMany({
          where: { accountId },
          select: { cardSkinId: true, quantity: true },
        }),
      ])

      const unlockedIds = new Set(
        unlocked.filter((skin) => skin.quantity > 0).map((skin) => skin.cardSkinId)
      )
      const deck: IEquippedDeck = {}

      for (const row of deckRows) {
        if (
          isCard(row.card) &&
          row.cardSkin.enabled &&
          row.cardSkin.card === row.card &&
          unlockedIds.has(row.cardSkinId)
        ) {
          deck[row.card] = row.cardSkinId
        }
      }

      return deck
    },
    async setDeckCardSkin(accountId, card, cardSkinId) {
      if (!accountId) {
        throw new Error("Account is required")
      }

      if (!isCard(card)) {
        throw new Error("Invalid card")
      }

      await service.seedInitialCardSkins()
      await grantInventoryReleases(accountId)

      if (cardSkinId === null) {
        await store.userDeckCard.deleteMany({
          where: { accountId, card },
        })
        return
      }

      const cardSkin = await store.cardSkin.findUnique({
        where: { id: cardSkinId },
      })

      if (!cardSkin || !cardSkin.enabled) {
        throw new Error("Card skin not found")
      }

      if (cardSkin.card !== card) {
        throw new Error("Card skin does not match card")
      }

      const owned = await store.userCardSkin.findUnique({
        where: { accountId_cardSkinId: { accountId, cardSkinId } },
      })

      if (!owned) {
        throw new Error("Card skin is locked")
      }

      await store.userDeckCard.upsert({
        where: { accountId_card: { accountId, card } },
        create: { accountId, card, cardSkinId },
        update: { cardSkinId },
      })
    },
    async grantSkin(accountId, cardSkinId, source) {
      const cardSkin = await store.cardSkin.findUnique({
        where: { id: cardSkinId },
      })

      if (!cardSkin || !cardSkin.enabled) {
        throw new Error("Card skin not found")
      }

      await store.userCardSkin.upsert({
        where: { accountId_cardSkinId: { accountId, cardSkinId } },
        create: { accountId, cardSkinId, source, quantity: 1 },
        update: { source, quantity: { increment: 1 } },
      })
    },
    async grantRelease(accountId, release, source) {
      const skins = await store.cardSkin.findMany({
        where: { release, enabled: true },
        select: { id: true },
      })

      for (const skin of skins) {
        await store.userCardSkin.upsert({
          where: { accountId_cardSkinId: { accountId, cardSkinId: skin.id } },
          create: { accountId, cardSkinId: skin.id, source, quantity: 1 },
          update: { source },
        })
      }
    },
    async rollSkins(accountId, cardSkinIds) {
      if (!accountId) {
        throw new Error("Account is required")
      }

      if (
        !Array.isArray(cardSkinIds) ||
        cardSkinIds.length !== SKIN_ROLL_COST ||
        cardSkinIds.some((id) => typeof id !== "string" || !id)
      ) {
        throw new Error(`Exactly ${SKIN_ROLL_COST} card skins are required`)
      }

      return runInTransaction(async (tx) => {
        const requestedById = cardSkinIds.reduce<Map<string, number>>((counts, id) => {
          counts.set(id, (counts.get(id) || 0) + 1)
          return counts
        }, new Map())
        const uniqueIds = Array.from(requestedById.keys())
        const inputSkins = await tx.cardSkin.findMany({
          where: { id: { in: uniqueIds }, enabled: true },
        })

        if (inputSkins.length !== uniqueIds.length) {
          throw new Error("Card skin not found")
        }

        const inputRarities = new Set(inputSkins.map((skin) => skin.rarity as CardSkinRarity))
        if (inputRarities.size !== 1) {
          throw new Error("All card skins must have the same rarity")
        }

        const inputRarity = inputSkins[0].rarity as CardSkinRarity
        const outputRarity = NEXT_ROLL_RARITY[inputRarity]
        if (!outputRarity) {
          throw new Error(`${inputRarity} card skins cannot be rolled`)
        }

        const ownedRows = await tx.userCardSkin.findMany({
          where: { accountId, cardSkinId: { in: uniqueIds } },
          select: { cardSkinId: true, quantity: true },
        })
        const ownedById = new Map(ownedRows.map((row) => [row.cardSkinId, row.quantity]))
        const hasEveryCopy = Array.from(requestedById).every(
          ([cardSkinId, quantity]) => (ownedById.get(cardSkinId) || 0) >= quantity
        )
        if (!hasEveryCopy) {
          throw new Error("You do not own enough copies of the selected card skins")
        }

        const rewardPool = await tx.cardSkin.findMany({
          where: { enabled: true, unlockable: true, rarity: outputRarity },
          orderBy: [{ id: "asc" }],
        })
        if (!rewardPool.length) {
          throw new Error(`No ${outputRarity} card skins are available`)
        }

        for (const [cardSkinId, quantity] of requestedById) {
          const consumed = await tx.userCardSkin.updateMany({
            where: { accountId, cardSkinId, quantity: { gte: quantity } },
            data: { quantity: { decrement: quantity } },
          })
          if (consumed.count !== 1) {
            throw new Error("You do not own enough copies of the selected card skins")
          }
        }

        const depletedIds = (
          await tx.userCardSkin.findMany({
            where: { accountId, cardSkinId: { in: uniqueIds }, quantity: 0 },
            select: { cardSkinId: true },
          })
        ).map((row) => row.cardSkinId)

        if (depletedIds.length) {
          await tx.userDeckCard.deleteMany({
            where: { accountId, cardSkinId: { in: depletedIds } },
          })
          await tx.userCardSkin.deleteMany({
            where: { accountId, cardSkinId: { in: depletedIds }, quantity: 0 },
          })
        }

        const rewardedSkin = rewardPool[random(rewardPool.length)]
        await tx.userCardSkin.upsert({
          where: { accountId_cardSkinId: { accountId, cardSkinId: rewardedSkin.id } },
          create: {
            accountId,
            cardSkinId: rewardedSkin.id,
            source: "skin-roll",
            quantity: 1,
          },
          update: { source: "skin-roll", quantity: { increment: 1 } },
        })
        const roll = await tx.userSkinRoll.create({
          data: {
            accountId,
            inputRarity,
            outputRarity,
            consumedSkinIds: cardSkinIds,
            rewardedSkinId: rewardedSkin.id,
          },
        })

        return {
          rollId: roll.id,
          inputRarity,
          outputRarity,
          consumedSkinIds: cardSkinIds,
          rewardedSkin: toCardSkin(rewardedSkin),
        }
      })
    },
  }

  return service
}
