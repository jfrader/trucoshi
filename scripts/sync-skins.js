#!/usr/bin/env node

const fs = require("fs")
const path = require("path")

const IMAGE_EXTENSIONS = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"])
const RARITY_ORDER = ["COMMON", "RARE", "EPIC", "LEGENDARY", "PROMO", ""]
const RARITY_RANKS = new Map(RARITY_ORDER.map((rarity, index) => [rarity, index]))

const repoRoot = path.resolve(__dirname, "..")

const options = {
  assetsDir: null,
  dryRun: false,
  release: null,
  skinsJson: path.resolve(repoRoot, "src/cosmetics/skins.json"),
}

const usage = () => {
  console.error("Usage: yarn sync:skins <release> [--dry-run] [--assets-dir <path>] [--skins-json <path>]")
}

for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index]
  const next = process.argv[index + 1]

  if (arg === "--dry-run") {
    options.dryRun = true
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

if (!options.assetsDir) {
  options.assetsDir = path.resolve(
    repoRoot,
    `../trucoshi-client/src/assets/cards/skins/${options.release}`
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

const skinFromFileName = (fileName, release) => {
  const ext = path.extname(fileName)
  const baseName = path.basename(fileName, ext)
  const card = cardFromFileName(fileName, release)

  if (!card) {
    return null
  }

  return {
    id: `${release}/${baseName}`,
    card,
    fileName,
    assetPath: `skins/${release}/${fileName}`,
    rarity: "",
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

const missingSkins = fs
  .readdirSync(options.assetsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((fileName) => IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase()))
  .sort((a, b) => a.localeCompare(b))
  .flatMap((fileName) => {
    const skin = skinFromFileName(fileName, options.release)

    if (!skin) {
      skipped.push(`${fileName} (does not match *_${options.release}_*)`)
      return []
    }

    if (existingIds.has(skin.id) || existingFileNames.has(skin.fileName)) {
      return []
    }

    return [skin]
  })

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
