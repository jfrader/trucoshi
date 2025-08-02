import { Api, User } from "lightning-accounts"
import jwt, { JwtPayload } from "jsonwebtoken"
import { getPublicKey } from "../utils/config/lightningAccounts"
import { SocketError } from "../server"
import { memoizeMinute } from "../lib/utils"
import { networkInterfaces } from "os"

const token = `${process.env.APP_LIGHTNING_ACCOUNTS_EMAIL}:${process.env.APP_LIGHTNING_ACCOUNTS_PASSWORD}`

function getCookieName(name: string) {
  return (process.env.APP_LIGHTNING_ACCOUNTS_COOKIE_PREFIX || "") + name
}

// Get container’s IP dynamically
const getContainerIp = (): string => {
  const interfaces = networkInterfaces()
  const dockerInterface = interfaces["eth0"] || interfaces["en0"] || interfaces["eth1"]
  if (dockerInterface) {
    const ipv4 = dockerInterface.find((iface) => iface.family === "IPv4")
    if (ipv4?.address) {
      return ipv4.address
    }
  }
  console.warn("FALLING BACK TO 10.29.0.1...")
  return process.env.DOCKER_CLIENT_IP || "10.29.0.1"
}

const clientIp = getContainerIp()

console.info("Using " + clientIp + " as X-Real-IP")

const api = new Api({
  baseURL: process.env.APP_LIGHTNING_ACCOUNTS_URL,
  withCredentials: true,
  secure: process.env.NODE_ENV === "production",
  headers: {
    Cookie: `Lightning-Application-Token=${token};`,
    "X-Forwarded-For": clientIp,
    "X-Real-IP": clientIp,
  },
})

const publicKey = getPublicKey()

const validateJwt = (identityJwt: string, account: Pick<User, "id">): JwtPayload => {
  try {
    const payload = jwt.verify(identityJwt, publicKey) as JwtPayload

    if (!payload.sub || account.id !== Number(payload.sub)) {
      throw new Error()
    }

    return payload
  } catch {
    throw new SocketError("INVALID_IDENTITY", "Invalid identity")
  }
}

const getMemoLatestBitcoinBlock = memoizeMinute(api.wallet.getLatestBitcoinBlock)

export { api as accountsApi, getMemoLatestBitcoinBlock, validateJwt, getCookieName }
