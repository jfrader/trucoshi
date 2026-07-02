import { Prisma, PrismaClient } from "@prisma/client"
import { createRandomIndexPicker, RandomIndexPicker } from "../../lib/classes/Random"
import { TREASURE_CONFIG, TREASURE_RARITIES } from "../../lib/Treasures"
import {
  CardSkinRarity,
  ICardSkin,
  ITreasureChest,
  ITreasureOpenResult,
  ITreasureStatus,
} from "../../types"

type Store = PrismaClient | Prisma.TransactionClient

const toTreasureChest = (chest: {
  id: number
  sourceMatchId: number | null
  earnedAt: Date
}): ITreasureChest => ({
  id: chest.id,
  sourceMatchId: chest.sourceMatchId,
  earnedAt: chest.earnedAt.toISOString(),
})

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
  card: skin.card as ICardSkin["card"],
  description: skin.description,
  fileName: skin.fileName,
  assetPath: skin.assetPath,
  rarity: skin.rarity as CardSkinRarity,
  enabled: skin.enabled,
  unlockable: skin.unlockable,
})

const isUniqueConstraintError = (e: unknown) =>
  (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") ||
  (typeof e === "object" && e !== null && "code" in e && e.code === "P2002")

export interface ITreasureService {
  creditEligibleMatch(accountId: number, matchId: number): Promise<ITreasureStatus>
  grantDevChest(accountId: number): Promise<ITreasureStatus>
  getTreasureStatus(accountId: number): Promise<ITreasureStatus>
  openChest(accountId: number, chestId: number): Promise<ITreasureOpenResult>
}

export function TreasureService(
  store: Store,
  random: RandomIndexPicker = createRandomIndexPicker("treasure-service")
): ITreasureService {
  const rollRarity = (): CardSkinRarity | null => {
    const entries = TREASURE_RARITIES.map((rarity) => ({
      rarity,
      weight: TREASURE_CONFIG.rarityWeights[rarity] || 0,
    })).filter(({ weight }) => weight > 0)
    const total = entries.reduce((sum, { weight }) => sum + weight, 0)

    if (total <= 0) {
      return null
    }

    let roll = random(total)
    for (const entry of entries) {
      roll -= entry.weight
      if (roll < 0) {
        return entry.rarity
      }
    }

    return entries.at(-1)?.rarity || null
  }

  const service: ITreasureService = {
    async creditEligibleMatch(accountId, matchId) {
      try {
        await store.userTreasureMatchCredit.create({
          data: { accountId, matchId },
        })
      } catch (e) {
        if (isUniqueConstraintError(e)) {
          return service.getTreasureStatus(accountId)
        }
        throw e
      }

      const existingProgress = await store.userTreasureProgress.findUnique({
        where: { accountId },
      })
      const currentProgress = existingProgress?.progress || 0
      const nextProgress = currentProgress + 1

      if (nextProgress >= TREASURE_CONFIG.eligibleMatchesPerChest) {
        await store.userTreasureProgress.upsert({
          where: { accountId },
          create: { accountId, progress: 0 },
          update: { progress: 0 },
        })
        await store.userTreasureChest.create({
          data: { accountId, sourceMatchId: matchId },
        })
      } else {
        await store.userTreasureProgress.upsert({
          where: { accountId },
          create: { accountId, progress: nextProgress },
          update: { progress: nextProgress },
        })
      }

      return service.getTreasureStatus(accountId)
    },
    async grantDevChest(accountId) {
      await store.userTreasureChest.create({
        data: { accountId, sourceMatchId: null },
      })

      return service.getTreasureStatus(accountId)
    },
    async getTreasureStatus(accountId) {
      const [progress, chests] = await Promise.all([
        store.userTreasureProgress.findUnique({
          where: { accountId },
        }),
        store.userTreasureChest.findMany({
          where: { accountId, openedAt: null },
          orderBy: [{ earnedAt: "asc" }, { id: "asc" }],
        }),
      ])

      return {
        progress: progress?.progress || 0,
        threshold: TREASURE_CONFIG.eligibleMatchesPerChest,
        unopenedChests: chests.map(toTreasureChest),
      }
    },
    async openChest(accountId, chestId) {
      const chest = await store.userTreasureChest.findUnique({
        where: { id: chestId },
      })

      if (!chest || chest.accountId !== accountId || chest.openedAt) {
        throw new Error("Treasure chest not found")
      }

      const rarity = rollRarity()
      if (!rarity) {
        await store.userTreasureChest.update({
          where: { id: chestId },
          data: { openedAt: new Date(), rolledRarity: null, cardSkinId: null, duplicate: false },
        })
        return { chestId, rarity: null, cardSkin: null, duplicate: false, granted: false }
      }

      const skins = await store.cardSkin.findMany({
        where: { enabled: true, unlockable: true, rarity },
        orderBy: [{ id: "asc" }],
      })

      if (!skins.length) {
        await store.userTreasureChest.update({
          where: { id: chestId },
          data: { openedAt: new Date(), rolledRarity: rarity, cardSkinId: null, duplicate: false },
        })
        return { chestId, rarity, cardSkin: null, duplicate: false, granted: false }
      }

      const selected = skins[random(skins.length)]
      const owned = await store.userCardSkin.findUnique({
        where: { accountId_cardSkinId: { accountId, cardSkinId: selected.id } },
      })
      const duplicate = Boolean(owned)

      if (!duplicate) {
        await store.userCardSkin.upsert({
          where: { accountId_cardSkinId: { accountId, cardSkinId: selected.id } },
          create: { accountId, cardSkinId: selected.id, source: `treasure-chest:${chestId}` },
          update: { source: `treasure-chest:${chestId}` },
        })
      }

      await store.userTreasureChest.update({
        where: { id: chestId },
        data: {
          openedAt: new Date(),
          rolledRarity: rarity,
          cardSkinId: selected.id,
          duplicate,
        },
      })

      return {
        chestId,
        rarity,
        cardSkin: toCardSkin(selected),
        duplicate,
        granted: !duplicate,
      }
    },
  }

  return service
}
