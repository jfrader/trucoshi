export const getPublicKey = () => {
  return Buffer.from(process.env.APP_LIGHTNING_ACCOUNTS_JWT_PUBLIC_KEY || "", "base64").toString()
}
