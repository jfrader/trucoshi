import treasureConfig from "../cosmetics/treasures.json"
import type { CardSkinRarity, ITreasureConfig } from "../types"

const rarityWeights = treasureConfig.rarityWeights as Record<CardSkinRarity, number>

export const TREASURE_CONFIG: ITreasureConfig = {
  eligibleMatchesPerChest: treasureConfig.eligibleMatchesPerChest,
  rarityWeights,
}

export const TREASURE_RARITIES = Object.keys(rarityWeights) as CardSkinRarity[]
