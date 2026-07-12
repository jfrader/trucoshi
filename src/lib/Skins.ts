import skinReleases from "../cosmetics/skins.json"
import type { CardSkinRarity, ICard, ICardSkin } from "../types"

type RawSkinDefinition = Omit<
  ICardSkin,
  "release" | "assetPath" | "enabled" | "unlockable" | "rarity"
> & {
  rarity: CardSkinRarity
  enabled?: boolean
  unlockable?: boolean
}

type RawSkinRelease = {
  release: string
  grantOnInventory?: boolean
  grantSource?: string
  skins: RawSkinDefinition[]
}

export type ICardSkinRelease = {
  release: string
  grantOnInventory: boolean
  grantSource?: string
  skins: ICardSkin[]
}

const normalizeSkin = (release: string, skin: RawSkinDefinition): ICardSkin => ({
  enabled: true,
  unlockable: true,
  ...skin,
  release,
  assetPath: `web/releases/${release}/${skin.fileName}`,
})

export const SKIN_RELEASES: ICardSkinRelease[] = (skinReleases as RawSkinRelease[]).map(
  ({ release, grantOnInventory = false, grantSource, skins }) => ({
    release,
    grantOnInventory,
    grantSource,
    skins: skins.map((skin) => normalizeSkin(release, skin)),
  })
)

export const CARD_SKINS: ICardSkin[] = SKIN_RELEASES.flatMap(({ skins }) => skins)

export const INVENTORY_GRANT_RELEASES = SKIN_RELEASES.filter(
  ({ grantOnInventory }) => grantOnInventory
)
