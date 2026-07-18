import type { IAccountUser } from "../types"

/** The only upstream account properties Trucoshi needs to expose to clients. */
type PublicAccountSource = Pick<IAccountUser, "id" | "name" | "avatarUrl">

/**
 * Copy an account into a new, explicitly allowlisted public object.
 *
 * Do not replace this with object spreading: Lightning Accounts' generated
 * `User` type currently includes password, seedHash, wallet, token, and other
 * private fields.
 */
export const projectPublicAccount = (account: PublicAccountSource): IAccountUser => ({
  id: account.id,
  name: account.name,
  avatarUrl: account.avatarUrl,
})
