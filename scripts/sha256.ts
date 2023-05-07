const { createHash } = require("crypto")

export function hash(str: string) {
  return createHash("sha256").update(str).digest("hex")
}
