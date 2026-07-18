import { expect } from "chai"
import * as sinon from "sinon"
import type { User } from "lightning-accounts"
import { accountsApi } from "../../src/accounts/client"
import { projectPublicAccount } from "../../src/accounts/publicAccount"
import { Trucoshi, TrucoshiSocket, UserSession } from "../../src/server/classes"

const upstreamUser = (): User =>
  ({
    id: 42,
    name: "Safe profile",
    avatarUrl: "https://example.invalid/avatar.png",
    updatedAt: "2026-07-17T00:00:00.000Z",
    email: "private@example.invalid",
    password: "password-hash-must-not-leak",
    seedHash: "seed-hash-must-not-leak",
    hasPassword: true,
    hasSeed: true,
    role: "ADMIN",
    wallet: {
      id: 9,
      updatedAt: "2026-07-17T00:00:00.000Z",
      balanceInSats: 123456,
    },
    Token: [{ token: "identity-token-must-not-leak" }],
  }) as User

const expectSafeProjection = (value: unknown) => {
  expect(value).to.deep.equal({
    id: 42,
    name: "Safe profile",
    avatarUrl: "https://example.invalid/avatar.png",
  })
  expect(JSON.stringify(value)).not.to.include("password-hash-must-not-leak")
  expect(JSON.stringify(value)).not.to.include("seed-hash-must-not-leak")
  expect(JSON.stringify(value)).not.to.include("identity-token-must-not-leak")
  expect(value).not.to.have.property("password")
  expect(value).not.to.have.property("seedHash")
  expect(value).not.to.have.property("wallet")
  expect(value).not.to.have.property("Token")
}

describe("Lightning Accounts public projection", () => {
  it("copies only the allowlisted profile fields", () => {
    expectSafeProjection(projectPublicAccount(upstreamUser()))
  })

  it("keeps upstream private fields out of session data emitted to clients", () => {
    const session = UserSession("session-key", "guest", "session-token")
    session.setAccount(upstreamUser())

    expectSafeProjection(session.getUserData().account)
    expect(session.role).to.equal("ADMIN")

    // Network data is a projection copy, not the mutable internal object.
    const emitted = session.getUserData().account as { name: string }
    emitted.name = "client mutation"
    expect(session.account?.name).to.equal("Safe profile")
  })

  it("projects the account returned from the account-details boundary", async () => {
    const getUser = sinon.stub(accountsApi.users, "getUser").resolves({
      data: upstreamUser(),
    } as Awaited<ReturnType<typeof accountsApi.users.getUser>>)
    const server = Trucoshi({ port: 0, serverVersion: "account-projection-test" })
    server.store = {
      matchPlayer: { findMany: sinon.stub().resolves([]) },
      userStats: { findFirst: sinon.stub().resolves(null) },
      $disconnect: sinon.stub().resolves(),
    } as unknown as typeof server.store
    const socket = {
      data: {
        matches: new Set<string>(),
        user: {
          key: "viewer-key",
          name: "viewer",
          session: "viewer-session",
          account: null,
        },
      },
    } as unknown as TrucoshiSocket

    try {
      const details = await server.getAccountDetails(socket, 42)

      expect(getUser.calledOnceWithExactly("42")).to.equal(true)
      expectSafeProjection(details.account)
    } finally {
      getUser.restore()
      await server.close()
    }
  })
})
