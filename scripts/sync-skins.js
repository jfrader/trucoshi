#!/usr/bin/env node

const fs = require("fs")
const path = require("path")

const IMAGE_EXTENSIONS = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"])
const VALID_RARITIES = new Set(["COMMON", "RARE", "EPIC", "LEGENDARY", "PROMO"])
const VALID_CARDS = new Set(
  ["1", "2", "3", "4", "5", "6", "7", "c", "p", "r"].flatMap((rank) =>
    ["b", "c", "e", "o"].map((suit) => `${rank}${suit}`)
  )
)
const RARITY_ORDER = ["COMMON", "RARE", "EPIC", "LEGENDARY", "PROMO", ""]
const RARITY_RANKS = new Map(RARITY_ORDER.map((rarity, index) => [rarity, index]))

const repoRoot = path.resolve(__dirname, "..")

const options = {
  assetsDir: null,
  check: false,
  dryRun: false,
  rarity: null,
  release: null,
  skinsJson: path.resolve(repoRoot, "src/cosmetics/skins.json"),
}

const usage = () => {
  console.error(
    "Usage: yarn sync:skins <release> [--rarity COMMON] [--check] [--dry-run] " +
      "[--assets-dir <path>] [--skins-json <path>]"
  )
}

for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index]
  const next = process.argv[index + 1]

  if (arg === "--check") {
    options.check = true
  } else if (arg === "--dry-run") {
    options.dryRun = true
  } else if (arg === "--rarity" && next) {
    options.rarity = next.toUpperCase()
    index += 1
  } else if (arg === "--assets-dir" && next) {
    options.assetsDir = path.resolve(process.cwd(), next)
    index += 1
  } else if (arg === "--release" && next) {
    options.release = next
    index += 1
  } else if (arg === "--skins-json" && next) {
    options.skinsJson = path.resolve(process.cwd(), next)
    index += 1
  } else if (!arg.startsWith("-") && !options.release) {
    options.release = arg
  } else {
    usage()
    console.error(`Unknown or incomplete argument: ${arg}`)
    process.exit(1)
  }
}

if (!options.release) {
  usage()
  process.exit(1)
}

if (!/^[a-z0-9][a-z0-9-]*$/.test(options.release)) {
  console.error("Release names must contain only lowercase letters, numbers, and hyphens.")
  process.exit(1)
}

if (options.rarity && !VALID_RARITIES.has(options.rarity)) {
  console.error(`Invalid rarity: ${options.rarity}`)
  process.exit(1)
}

if (!options.assetsDir) {
  options.assetsDir = path.resolve(
    repoRoot,
    `../trucoshi-client/src/generated/cards/releases/${options.release}`
  )
}

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"))

const cardFromFileName = (fileName, release) => {
  const marker = `_${release}_`
  const markerIndex = fileName.indexOf(marker)

  if (markerIndex <= 0) {
    return null
  }

  return fileName.slice(0, markerIndex)
}

const skinFromFileName = (fileName, release, rarity) => {
  const ext = path.extname(fileName)
  const baseName = path.basename(fileName, ext)
  const card = cardFromFileName(fileName, release)

  if (!card || !VALID_CARDS.has(card)) {
    return null
  }

  return {
    id: `${release}/${baseName}`,
    card,
    fileName,
    rarity,
  }
}

const rarityRank = (skin) => RARITY_RANKS.get(skin.rarity || "") ?? RARITY_ORDER.length

const sortSkinsByRarity = (skins) =>
  skins
    .map((skin, index) => ({ index, skin }))
    .sort((a, b) => rarityRank(a.skin) - rarityRank(b.skin) || a.index - b.index)
    .map(({ skin }) => skin)

if (!fs.existsSync(options.assetsDir)) {
  console.error(`Assets directory not found: ${options.assetsDir}`)
  process.exit(1)
}

const skinReleases = readJson(options.skinsJson)
let createdRelease = false
let releaseConfig = skinReleases.find(({ release }) => release === options.release)

if (!releaseConfig) {
  releaseConfig = {
    release: options.release,
    grantOnInventory: false,
    skins: [],
  }
  skinReleases.push(releaseConfig)
  createdRelease = true
}

const existingIds = new Set(releaseConfig.skins.map(({ id }) => id))
const existingFileNames = new Set(releaseConfig.skins.map(({ fileName }) => fileName))
const skipped = []

const assetFileNames = fs
  .readdirSync(options.assetsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((fileName) => IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase()))
  .sort((a, b) => a.localeCompare(b))

const missingSkins = assetFileNames
  .flatMap((fileName) => {
    const skin = skinFromFileName(fileName, options.release, options.rarity)

    if (!skin) {
      skipped.push(`${fileName} (does not match a valid CARD_${options.release}_NNN name)`)
      return []
    }

    if (existingIds.has(skin.id) || existingFileNames.has(skin.fileName)) {
      return []
    }

    return [skin]
  })

const validationErrors = [...skipped]
const configuredIds = new Set()
const configuredFiles = new Set()

for (const skin of releaseConfig.skins) {
  const parsed = skinFromFileName(skin.fileName, options.release, skin.rarity)
  const expectedId = parsed && `${options.release}/${path.basename(skin.fileName, path.extname(skin.fileName))}`
  if (!parsed || parsed.card !== skin.card) {
    validationErrors.push(`${skin.id || skin.fileName} has a card/fileName mismatch`)
  }
  if (skin.id !== expectedId) {
    validationErrors.push(`${skin.id || skin.fileName} has an invalid id`)
  }
  if (!VALID_RARITIES.has(skin.rarity)) {
    validationErrors.push(`${skin.id || skin.fileName} has invalid rarity ${JSON.stringify(skin.rarity)}`)
  }
  if (Object.prototype.hasOwnProperty.call(skin, "assetPath")) {
    validationErrors.push(`${skin.id || skin.fileName} stores assetPath; it must be derived`)
  }
  if (configuredIds.has(skin.id)) {
    validationErrors.push(`duplicate id ${skin.id}`)
  }
  if (configuredFiles.has(skin.fileName)) {
    validationErrors.push(`duplicate fileName ${skin.fileName}`)
  }
  configuredIds.add(skin.id)
  configuredFiles.add(skin.fileName)
}

for (const fileName of configuredFiles) {
  if (!assetFileNames.includes(fileName)) {
    validationErrors.push(`configured asset is missing: ${fileName}`)
  }
}

if (options.check) {
  for (const skin of missingSkins) {
    validationErrors.push(`unregistered asset: ${skin.fileName}`)
  }
  if (validationErrors.length > 0) {
    console.error(`Skin release "${options.release}" is invalid:`)
    for (const message of validationErrors) console.error(`- ${message}`)
    process.exit(1)
  }
  console.log(
    `Skin release "${options.release}" is valid (${releaseConfig.skins.length} registered asset(s)).`
  )
  process.exit(0)
}

if (missingSkins.length > 0 && !VALID_RARITIES.has(options.rarity)) {
  console.error(
    `Found ${missingSkins.length} new skin(s). Pass --rarity followed by ${
      Array.from(VALID_RARITIES).join(", ")
    }.`
  )
  process.exit(1)
}

if (validationErrors.length > 0) {
  console.error(`Existing skin release "${options.release}" is invalid:`)
  for (const message of validationErrors) console.error(`- ${message}`)
  process.exit(1)
}

releaseConfig.skins.push(...missingSkins)

for (const releaseConfig of skinReleases) {
  releaseConfig.skins = sortSkinsByRarity(releaseConfig.skins)
}

if (!options.dryRun) {
  fs.writeFileSync(options.skinsJson, `${JSON.stringify(skinReleases, null, 2)}\n`)
}

const action = options.dryRun ? "Would add" : "Added"
const writeAction = options.dryRun ? "Would order" : "Ordered"

console.log(`${action} ${missingSkins.length} missing ${options.release} skin(s).`)
console.log(`${writeAction} skins in ${path.relative(repoRoot, options.skinsJson)} by rarity.`)

if (createdRelease) {
  const createAction = options.dryRun ? "Would create" : "Created"
  console.log(`${createAction} release "${options.release}" in ${path.relative(repoRoot, options.skinsJson)}.`)
}

for (const skin of missingSkins) {
  console.log(`- ${skin.id}`)
}

if (skipped.length > 0) {
  console.warn(`Skipped ${skipped.length} file(s):`)
  for (const message of skipped) {
    console.warn(`- ${message}`)
  }
}
