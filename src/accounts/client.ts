import { Api } from "lightning-accounts"

const api = new Api({
  baseURL: process.env.NODE_LIGHTNING_ACCOUNTS_URL,
  withCredentials: true,
  secure: process.env.NODE_ENV === "production",
  headers: {
    Cookie:
      "Lightning-Application-Token=admin@trucoshi.com:trucoshi123aaklsjdlaksdjlkas2ll2j2mmmcjkj1n2n3nn123;",
  },
})

export { api as accountsApi }
