import { Api, User } from "lightning-accounts"
import jwt, { JwtPayload } from "jsonwebtoken"
import { getPublicKey } from "../utils/config/lightningAccounts"
import { SocketError } from "../server"

const token = `${process.env.APP_LIGHTNING_ACCOUNTS_EMAIL}:${process.env.APP_LIGHTNING_ACCOUNTS_PASSWORD}`

const api = new Api({
  baseURL: process.env.APP_LIGHTNING_ACCOUNTS_URL,
  withCredentials: true,
  secure: process.env.NODE_ENV === "production",
  headers: {
    Cookie: `Lightning-Application-Token=${token};`,
  },
})

const publicKey = getPublicKey()

const validateJwt = (identityJwt: string, account: User): JwtPayload => {
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

export { api as accountsApi, validateJwt }
