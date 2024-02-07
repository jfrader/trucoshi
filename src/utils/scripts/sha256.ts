const { createHash } = require("crypto")

const salt = process.env.APP_SALT

export function hash(str: string) {
  return createHash("sha256")
    .update(str)
    .update(createHash("sha256").update(salt, "utf8").digest("hex"))
    .digest("hex")
}
