import { Prisma, PrismaClient } from "@prisma/client"
import { CARD_SKINS, INVENTORY_GRANT_RELEASES } from "../../lib/Skins"
import { CARDS } from "../../lib/constants"
import {
  CardSkinId,
  ICard,
  ICardSkin,
  IEquippedDeck,
  IInventoryCardGroup,
  IInventoryCardSkin,
} from "../../types"

type Store = PrismaClient | Prisma.TransactionClient

const allCards = Object.keys(CARDS) as ICard[]

const isCard = (card: string): card is ICard => card in CARDS

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
}

export function InventoryService(store: Store): IInventoryService {
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
          select: { cardSkinId: true },
        }),
        store.userDeckCard.findMany({
          where: { accountId },
          select: { card: true, cardSkinId: true },
        }),
      ])

      const unlockedIds = new Set(unlocked.map((skin) => skin.cardSkinId))
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
          unlocked: unlockedIds.has(skin.id),
          equipped: equippedByCard[skin.card] === skin.id,
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
          select: { cardSkinId: true },
        }),
      ])

      const unlockedIds = new Set(unlocked.map((skin) => skin.cardSkinId))
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
        create: { accountId, cardSkinId, source },
        update: { source },
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
          create: { accountId, cardSkinId: skin.id, source },
          update: { source },
        })
      }
    },
  }

  return service
}
