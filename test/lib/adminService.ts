import { expect } from "chai"
import {
  AdminRewardCodeInternals,
  AdminService,
} from "../../src/server/services/AdminService.ts"
import { SocketError } from "../../src/server/classes/SocketError.ts"

function createFakeStore() {
  const rewardCodes = new Map<
    number,
    {
      id: number
      codeHash: string
      codePreview: string
      createdByAccountId: number
      intendedAccountId: number | null
      note: string | null
      createdAt: Date
      redeemedAt: Date | null
      redeemedByAccountId: number | null
      treasureChestId: number | null
    }
  >()
  const chests = new Map<
    number,
    {
      id: number
      accountId: number
      sourceMatchId: number | null
      earnedAt: Date
      openedAt: Date | null
      rolledRarity: string | null
      cardSkinId: string | null
      duplicate: boolean
    }
  >()
  const noticeBanners = new Map<
    number,
    {
      id: number
      text: string
      severity: string
      buttonText: string | null
      buttonHref: string | null
      active: boolean
      updatedByAccountId: number
      createdAt: Date
      updatedAt: Date
    }
  >()
  let nextId = 1

  const store = {
    adminNoticeBanner: {
      async findFirst() {
        return (
          Array.from(noticeBanners.values()).sort((a, b) => {
            const updatedDiff = b.updatedAt.getTime() - a.updatedAt.getTime()
            return updatedDiff || b.id - a.id
          })[0] || null
        )
      },
      async create({ data }: any) {
        const now = new Date(Date.now() + nextId)
        const row = {
          id: nextId++,
          text: data.text,
          severity: data.severity,
          buttonText: data.buttonText || null,
          buttonHref: data.buttonHref || null,
          active: data.active,
          updatedByAccountId: data.updatedByAccountId,
          createdAt: now,
          updatedAt: now,
        }
        noticeBanners.set(row.id, row)
        return row
      },
    },
    adminRewardCode: {
      async findMany({ take }: any = {}) {
        return Array.from(rewardCodes.values())
          .sort((a, b) => b.id - a.id)
          .slice(0, take)
      },
      async create({ data }: any) {
        if (Array.from(rewardCodes.values()).some((row) => row.codeHash === data.codeHash)) {
          throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
        }

        const row = {
          id: nextId++,
          codeHash: data.codeHash,
          codePreview: data.codePreview,
          createdByAccountId: data.createdByAccountId,
          intendedAccountId: data.intendedAccountId || null,
          note: data.note || null,
          createdAt: new Date(),
          redeemedAt: null,
          redeemedByAccountId: null,
          treasureChestId: null,
        }
        rewardCodes.set(row.id, row)
        return row
      },
      async findUnique({ where }: any) {
        return Array.from(rewardCodes.values()).find((row) => row.codeHash === where.codeHash) || null
      },
      async updateMany({ where, data }: any) {
        const row = rewardCodes.get(where.id)
        if (!row || row.redeemedAt !== where.redeemedAt) {
          return { count: 0 }
        }

        rewardCodes.set(row.id, { ...row, ...data })
        return { count: 1 }
      },
      async update({ where, data }: any) {
        const row = rewardCodes.get(where.id)
        if (!row) {
          throw new Error("Not found")
        }

        const updated = { ...row, ...data }
        rewardCodes.set(row.id, updated)
        return updated
      },
    },
    userTreasureProgress: {
      async findUnique() {
        return null
      },
    },
    userTreasureChest: {
      async create({ data }: any) {
        const row = {
          id: nextId++,
          accountId: data.accountId,
          sourceMatchId: data.sourceMatchId || null,
          earnedAt: new Date(),
          openedAt: null,
          rolledRarity: null,
          cardSkinId: null,
          duplicate: false,
        }
        chests.set(row.id, row)
        return row
      },
      async findMany({ where }: any) {
        return Array.from(chests.values())
          .filter((chest) => chest.accountId === where.accountId)
          .filter((chest) => (where.openedAt === null ? !chest.openedAt : true))
          .sort((a, b) => a.id - b.id)
      },
    },
    async $transaction(fn: any) {
      return fn(store)
    },
    __rows: {
      rewardCodes,
      chests,
      noticeBanners,
    },
  }

  return store as any
}

describe("AdminService", () => {
  const adminProviders = {
    getAccount: async (accountId: number) =>
      ({ id: accountId, name: "Admin", role: "ADMIN" }) as any,
    getOnlineAccounts: () => [],
    getLiveGames: () => [],
  }

  it("creates one-time chest codes without storing the raw code", async () => {
    const store = createFakeStore()
    const service = AdminService(store, adminProviders)

    const result = await service.createChestRewardCode(
      { id: 1, name: "Admin", role: "ADMIN" } as any,
      { note: "promo" }
    )
    const rows = Array.from(store.__rows.rewardCodes.values())

    expect(result.code).to.match(/^[A-Z0-9]{12}$/)
    expect(result.link).to.equal(`https://trucoshi.com/?code=${result.code}`)
    expect(rows).to.have.length(1)
    expect(rows[0].codeHash).to.equal(AdminRewardCodeInternals.hashRewardCode(result.code))
    expect(rows[0].codeHash).to.not.include(result.code)
    expect(rows[0]).to.not.have.property("code")
    expect(rows[0].note).to.equal("promo")
  })

  it("saves an active notice banner and includes it in public fetch and dashboard", async () => {
    const store = createFakeStore()
    const service = AdminService(store, adminProviders)

    const result = await service.setNoticeBanner(
      { id: 1, name: "Admin", role: "ADMIN" } as any,
      {
        active: true,
        text: "Mantenimiento esta noche",
        severity: "warning",
        buttonText: "Leer mas",
        buttonHref: "/help",
      }
    )
    const publicNotice = await service.getNoticeBanner()
    const dashboard = await service.getDashboard({ id: 1, name: "Admin", role: "ADMIN" } as any)

    expect(result.noticeBanner?.active).to.equal(true)
    expect(result.publicNoticeBanner?.text).to.equal("Mantenimiento esta noche")
    expect(result.publicNoticeBanner?.severity).to.equal("warning")
    expect(publicNotice?.buttonHref).to.equal("/help")
    expect(dashboard.noticeBanner?.updatedByAccountId).to.equal(1)
  })

  it("hides the notice banner by creating an inactive latest row", async () => {
    const store = createFakeStore()
    const service = AdminService(store, adminProviders)

    await service.setNoticeBanner({ id: 1, name: "Admin", role: "ADMIN" } as any, {
      active: true,
      text: "Visible",
      severity: "info",
    })
    const hidden = await service.setNoticeBanner({ id: 1, name: "Admin", role: "ADMIN" } as any, {
      active: false,
      text: "",
      severity: "info",
    })

    expect(hidden.noticeBanner?.active).to.equal(false)
    expect(hidden.publicNoticeBanner).to.equal(null)
    expect(await service.getNoticeBanner()).to.equal(null)
  })

  it("validates notice banner content", async () => {
    const service = AdminService(createFakeStore(), adminProviders)

    try {
      await service.setNoticeBanner({ id: 1, name: "Admin", role: "ADMIN" } as any, {
        active: true,
        text: "",
        severity: "info",
      })
      throw new Error("Expected empty active notice to fail")
    } catch (e) {
      expect(e).to.be.instanceOf(SocketError)
      expect((e as SocketError).code).to.equal("INVALID_INPUT")
    }

    try {
      await service.setNoticeBanner({ id: 1, name: "Admin", role: "ADMIN" } as any, {
        active: true,
        text: "Visible",
        severity: "info",
        buttonText: "Leer mas",
      })
      throw new Error("Expected partial button to fail")
    } catch (e) {
      expect(e).to.be.instanceOf(SocketError)
      expect((e as SocketError).code).to.equal("INVALID_INPUT")
    }

    try {
      await service.setNoticeBanner({ id: 1, name: "Admin", role: "ADMIN" } as any, {
        active: true,
        text: "Visible",
        severity: "info",
        buttonText: "Leer mas",
        buttonHref: "javascript:alert(1)",
      })
      throw new Error("Expected invalid link to fail")
    } catch (e) {
      expect(e).to.be.instanceOf(SocketError)
      expect((e as SocketError).code).to.equal("INVALID_INPUT")
    }
  })

  it("redeems a code once and creates one unopened chest", async () => {
    const store = createFakeStore()
    const service = AdminService(store, adminProviders)
    const created = await service.createChestRewardCode({ id: 1, role: "ADMIN" } as any)

    const redeemed = await service.redeemRewardCode(2, created.code)

    expect(redeemed.treasureStatus.unopenedChests).to.have.length(1)
    expect(redeemed.treasureStatus.unopenedChests[0].id).to.equal(redeemed.grantedChest.id)
    expect(store.__rows.chests.size).to.equal(1)

    try {
      await service.redeemRewardCode(2, created.code)
      throw new Error("Expected duplicate redemption to fail")
    } catch (e) {
      expect(e).to.be.instanceOf(SocketError)
      expect((e as SocketError).code).to.equal("REWARD_CODE_REDEEMED")
    }
  })

  it("rejects invalid codes", async () => {
    const service = AdminService(createFakeStore(), adminProviders)

    try {
      await service.redeemRewardCode(2, "missing")
      throw new Error("Expected invalid code to fail")
    } catch (e) {
      expect(e).to.be.instanceOf(SocketError)
      expect((e as SocketError).code).to.equal("REWARD_CODE_INVALID")
    }
  })

  it("requires a fresh ADMIN role for admin actions", async () => {
    const service = AdminService(createFakeStore(), {
      getAccount: async (accountId: number) =>
        ({ id: accountId, name: "Player", role: "USER" }) as any,
      getOnlineAccounts: () => [],
      getLiveGames: () => [],
    })

    try {
      await service.getDashboard({ id: 1, name: "Player", role: "ADMIN" } as any)
      throw new Error("Expected admin check to fail")
    } catch (e) {
      expect(e).to.be.instanceOf(SocketError)
      expect((e as SocketError).code).to.equal("FORBIDDEN")
    }

    try {
      await service.setNoticeBanner({ id: 1, name: "Player", role: "ADMIN" } as any, {
        active: true,
        text: "Visible",
        severity: "info",
      })
      throw new Error("Expected admin notice check to fail")
    } catch (e) {
      expect(e).to.be.instanceOf(SocketError)
      expect((e as SocketError).code).to.equal("FORBIDDEN")
    }
  })
})
