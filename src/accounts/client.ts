import { Api, User } from "lightning-accounts"
import jwt, { JwtPayload } from "jsonwebtoken"
import { getPublicKey } from "../utils/config/lightningAccounts"

const token = `${process.env.NODE_LIGHTNING_ACCOUNTS_EMAIL}:${process.env.NODE_LIGHTNING_ACCOUNTS_PASSWORD}`

const api = new Api({
  baseURL: process.env.NODE_LIGHTNING_ACCOUNTS_URL,
  withCredentials: true,
  secure: process.env.NODE_ENV === "production",
  headers: {
    Cookie: `Lightning-Application-Token=${token};`,
  },
})

const validateJwt = (identityJwt: string, account: User): JwtPayload => {
  const payload = jwt.verify(identityJwt, getPublicKey()) as JwtPayload

  if (!payload.sub || account.id !== Number(payload.sub)) {
    throw new Error("JWT payload doesn't have account id or is not valid")
  }

  return payload
}

export { api as accountsApi, validateJwt }
