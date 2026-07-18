#!/usr/bin/env node

const fs = require("fs")
const path = require("path")

const repositoryRoot = path.resolve(__dirname, "..")
const readManifest = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"))

const published = readManifest("package.json")
const runtime = readManifest("server-runtime/package.json")
const sourceBuild = readManifest("source-build/package.json")
const publishedRuntimeDependencies = ["node-forge"]
const sourceBuildDependencies = {
  "@types/node": "^24.12.0",
  "@types/node-forge": "^1.3.14",
  "node-forge": "^1.3.3",
  rimraf: "^6.1.3",
  typescript: "5.9.3",
}
const publishedPackageFiles = [
  ".nvmrc",
  "LICENSE",
  "dist/events.d.ts",
  "dist/events.js",
  "dist/lib/classes/Deck.d.ts",
  "dist/lib/classes/Deck.js",
  "dist/lib/classes/Random.d.ts",
  "dist/lib/classes/Random.js",
  "dist/lib/classes/Table.d.ts",
  "dist/lib/classes/Table.js",
  "dist/lib/classes/index.d.ts",
  "dist/lib/classes/index.js",
  "dist/lib/constants.d.ts",
  "dist/lib/constants.js",
  "dist/lib/index.d.ts",
  "dist/lib/index.js",
  "dist/types.d.ts",
  "dist/types.js",
  "src/events.ts",
  "src/lib/classes/Deck.ts",
  "src/lib/classes/Random.ts",
  "src/lib/classes/Table.ts",
  "src/lib/classes/index.ts",
  "src/lib/constants.ts",
  "src/lib/index.ts",
  "src/types.ts",
  "source-build/package.json",
  "source-build/yarn.lock",
  "tsconfig.base.json",
  "tsconfig.package.json",
].sort()

const errors = []
const publishedDependencies = published.dependencies || {}
const developmentDependencies = published.devDependencies || {}
const runtimeDependencies = runtime.dependencies || {}
const publishedFiles = published.files || []

const actualPublishedDependencies = Object.keys(publishedDependencies).sort()

if (published.publishConfig?.access !== "public") {
  errors.push("Published package access must remain explicitly public")
}
if (/-rc\.\d+$/.test(published.version) && published.publishConfig?.tag !== "rc") {
  errors.push("Release-candidate versions must publish under the rc dist-tag")
}
if (!published.version.includes("-") && published.publishConfig?.tag === "rc") {
  errors.push("Stable versions must not publish under the rc dist-tag")
}

if (JSON.stringify(actualPublishedDependencies) !== JSON.stringify(publishedRuntimeDependencies)) {
  errors.push(
    `Published dependencies must be ${publishedRuntimeDependencies.join(", ")}; found ${actualPublishedDependencies.join(", ")}`
  )
}

const actualPublishedFiles = [...publishedFiles].sort()
if (JSON.stringify(actualPublishedFiles) !== JSON.stringify(publishedPackageFiles)) {
  errors.push("Published file allowlist differs from the reviewed JS/source/config/license set")
}

for (const [name, version] of Object.entries(runtimeDependencies)) {
  const sourceVersion = publishedDependencies[name] || developmentDependencies[name]
  if (!sourceVersion) {
    errors.push(`Runtime dependency ${name} is unavailable to source installs`)
  } else if (sourceVersion !== version) {
    errors.push(`Runtime dependency ${name} differs: source=${sourceVersion}, runtime=${version}`)
  }
}

for (const [name, version] of Object.entries(publishedDependencies)) {
  if (runtimeDependencies[name] !== version) {
    errors.push(`Shared dependency ${name} must use the same version in the runtime manifest`)
  }
}

if (runtime.private !== true) {
  errors.push("The server runtime manifest must remain private")
}
for (const [name, manifest] of [
  ["Published", published],
  ["Server runtime", runtime],
  ["Source-build", sourceBuild],
]) {
  if (manifest.license !== "GPL-3.0-or-later") {
    errors.push(`${name} manifest license must be GPL-3.0-or-later`)
  }
}
if (runtime.version !== published.version) {
  errors.push(`Manifest versions differ: published=${published.version}, runtime=${runtime.version}`)
}
if (runtime.engines?.node !== published.engines?.node) {
  errors.push("Published and runtime Node engine ranges differ")
}
if (runtime.engines?.yarn !== published.engines?.yarn) {
  errors.push("Published and runtime Yarn engine versions differ")
}
if (sourceBuild.version !== published.version) {
  errors.push(`Source-build version differs: published=${published.version}, source-build=${sourceBuild.version}`)
}
if (sourceBuild.engines?.node !== published.engines?.node) {
  errors.push("Published and source-build Node engine ranges differ")
}
if (sourceBuild.engines?.yarn !== published.engines?.yarn) {
  errors.push("Published and source-build Yarn engine versions differ")
}
if (JSON.stringify(sourceBuild.devDependencies) !== JSON.stringify(sourceBuildDependencies)) {
  errors.push("Source-build dependencies differ from the reviewed minimal compiler toolchain")
}

if (errors.length) {
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

const serverOnlyDependencies = Object.keys(runtimeDependencies)
  .filter((name) => !publishedDependencies[name])
  .sort()

console.log(`Published runtime dependencies: ${actualPublishedDependencies.join(", ")}`)
console.log(`Server-only runtime dependencies: ${serverOnlyDependencies.join(", ")}`)
