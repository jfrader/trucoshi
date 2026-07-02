import { createHash } from "crypto"
import { Prisma, PrismaClient } from "@prisma/client"
import { User } from "lightning-accounts"
import { createRandomIndexPicker, RandomIndexPicker } from "../../lib/classes/Random"
import {
  IAdminCreateChestRewardCodeInput,
  IAdminCreateChestRewardCodeResult,
  IAdminDashboard,
  IAdminNoticeBanner,
  IAdminOnlineAccount,
  IAdminRewardCodeSummary,
  IAdminSetNoticeBannerInput,
  IAdminSetNoticeBannerResult,
  IPublicNoticeBanner,
  IPublicMatchInfo,
  IRewardCodeRedeemResult,
  ITreasureChest,
  NoticeBannerSeverity,
} from "../../types"
import { SocketError } from "../classes/SocketError"
import { TreasureService } from "./TreasureService"

type Store = PrismaClient
type AdminUser = User & { id: number }

const REWARD_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const REWARD_CODE_LENGTH = 12
const REWARD_CODE_MAX_ATTEMPTS = 5
const RECENT_REWARD_CODE_LIMIT = 20
const NOTICE_BANNER_TEXT_MAX_LENGTH = 240
const NOTICE_BANNER_BUTTON_TEXT_MAX_LENGTH = 48
const NOTICE_BANNER_BUTTON_HREF_MAX_LENGTH = 500
const NOTICE_BANNER_SEVERITIES: NoticeBannerSeverity[] = ["info", "warning", "error", "success"]

const isUniqueConstraintError = (e: unknown) =>
  (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") ||
  (typeof e === "object" && e !== null && "code" in e && e.code === "P2002")

const normalizeRewardCode = (code: string) =>
  code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")

const hashRewardCode = (code: string) =>
  createHash("sha256")
    .update("trucoshi-admin-reward-code")
    .update(process.env.APP_SALT || "")
    .update(normalizeRewardCode(code))
    .digest("hex")

const generateRewardCode = (random: RandomIndexPicker) =>
  Array.from({ length: REWARD_CODE_LENGTH }, () =>
    REWARD_CODE_ALPHABET[random(REWARD_CODE_ALPHABET.length)]
  ).join("")

const getCodePreview = (code: string) => `${code.slice(0, 3)}...${code.slice(-3)}`

const getPublicUrl = () =>
  (process.env.APP_PUBLIC_URL || "https://trucoshi.com").replace(/\/+$/, "")

const isNoticeBannerSeverity = (value: unknown): value is NoticeBannerSeverity =>
  NOTICE_BANNER_SEVERITIES.includes(value as NoticeBannerSeverity)

const normalizeNullableText = (value?: string | null) => {
  const text = value?.trim()
  return text || null
}

const assertNoticeBannerHref = (href: string | null) => {
  if (!href) {
    return
  }

  if (href.length > NOTICE_BANNER_BUTTON_HREF_MAX_LENGTH) {
    throw new SocketError("INVALID_INPUT", "El link del aviso es demasiado largo")
  }

  if (href.startsWith("/") && !href.startsWith("//")) {
    return
  }

  try {
    const url = new URL(href)
    if (url.protocol === "http:" || url.protocol === "https:") {
      return
    }
  } catch {
    // Fall through to validation error.
  }

  throw new SocketError("INVALID_INPUT", "El link del aviso debe ser relativo o http(s)")
}

const toTreasureChest = (chest: {
  id: number
  sourceMatchId: number | null
  earnedAt: Date
}): ITreasureChest => ({
  id: chest.id,
  sourceMatchId: chest.sourceMatchId,
  earnedAt: chest.earnedAt.toISOString(),
})

const toRewardCodeSummary = (row: {
  id: number
  codePreview: string
  createdByAccountId: number
  intendedAccountId: number | null
  note: string | null
  createdAt: Date
  redeemedAt: Date | null
  redeemedByAccountId: number | null
  treasureChestId: number | null
}): IAdminRewardCodeSummary => ({
  id: row.id,
  codePreview: row.codePreview,
  createdByAccountId: row.createdByAccountId,
  intendedAccountId: row.intendedAccountId,
  note: row.note,
  createdAt: row.createdAt.toISOString(),
  redeemedAt: row.redeemedAt?.toISOString() || null,
  redeemedByAccountId: row.redeemedByAccountId,
  treasureChestId: row.treasureChestId,
})

const toAdminNoticeBanner = (row: {
  id: number
  text: string
  severity: string
  buttonText: string | null
  buttonHref: string | null
  active: boolean
  updatedByAccountId: number
  createdAt: Date
  updatedAt: Date
}): IAdminNoticeBanner => ({
  id: row.id,
  text: row.text,
  severity: isNoticeBannerSeverity(row.severity) ? row.severity : "info",
  buttonText: row.buttonText,
  buttonHref: row.buttonHref,
  active: row.active,
  updatedByAccountId: row.updatedByAccountId,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

const toPublicNoticeBanner = (row: {
  id: number
  text: string
  severity: string
  buttonText: string | null
  buttonHref: string | null
  active: boolean
  updatedAt: Date
}): IPublicNoticeBanner | null => {
  if (!row.active || !row.text.trim()) {
    return null
  }

  return {
    id: row.id,
    text: row.text,
    severity: isNoticeBannerSeverity(row.severity) ? row.severity : "info",
    buttonText: row.buttonText,
    buttonHref: row.buttonHref,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export interface IAdminServiceProviders {
  getAccount(accountId: number): Promise<User | null>
  getOnlineAccounts(): IAdminOnlineAccount[]
  getLiveGames(): IPublicMatchInfo[]
}

export interface IAdminService {
  assertAdmin(account?: User | null): Promise<AdminUser>
  getNoticeBanner(): Promise<IPublicNoticeBanner | null>
  getDashboard(account?: User | null): Promise<IAdminDashboard>
  setNoticeBanner(
    account: User | null | undefined,
    input: IAdminSetNoticeBannerInput
  ): Promise<IAdminSetNoticeBannerResult>
  createChestRewardCode(
    account: User | null | undefined,
    input?: IAdminCreateChestRewardCodeInput
  ): Promise<IAdminCreateChestRewardCodeResult>
  redeemRewardCode(accountId: number, code: string): Promise<IRewardCodeRedeemResult>
}

export function AdminService(store: Store, providers: IAdminServiceProviders): IAdminService {
  const random = createRandomIndexPicker("admin-reward-code")

  const findRecentRewardCodes = async () =>
    store.adminRewardCode
      .findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: RECENT_REWARD_CODE_LIMIT,
      })
      .then((rows) => rows.map(toRewardCodeSummary))

  const findCurrentNoticeBanner = async () =>
    store.adminNoticeBanner.findFirst({
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    })

  const validateNoticeBannerInput = (input: IAdminSetNoticeBannerInput) => {
    const active = Boolean(input.active)
    const text = normalizeNullableText(input.text)
    const buttonText = normalizeNullableText(input.buttonText)
    const buttonHref = normalizeNullableText(input.buttonHref)
    const severity = isNoticeBannerSeverity(input.severity) ? input.severity : "info"

    if (active && !text) {
      throw new SocketError("INVALID_INPUT", "El aviso necesita un texto")
    }

    if (text && text.length > NOTICE_BANNER_TEXT_MAX_LENGTH) {
      throw new SocketError("INVALID_INPUT", "El texto del aviso es demasiado largo")
    }

    if (buttonText && buttonText.length > NOTICE_BANNER_BUTTON_TEXT_MAX_LENGTH) {
      throw new SocketError("INVALID_INPUT", "El texto del boton es demasiado largo")
    }

    if (Boolean(buttonText) !== Boolean(buttonHref)) {
      throw new SocketError("INVALID_INPUT", "El boton necesita texto y link")
    }

    assertNoticeBannerHref(buttonHref)

    return {
      active,
      text: text || "",
      severity,
      buttonText,
      buttonHref,
    }
  }

  const service: IAdminService = {
    async assertAdmin(account) {
      if (!account?.id) {
        throw new SocketError("FORBIDDEN", "Necesitas permisos de administrador")
      }

      const freshAccount = await providers.getAccount(account.id)

      if (freshAccount?.role !== "ADMIN" || !freshAccount.id) {
        throw new SocketError("FORBIDDEN", "Necesitas permisos de administrador")
      }

      return freshAccount as AdminUser
    },
    async getNoticeBanner() {
      const noticeBanner = await findCurrentNoticeBanner()
      return noticeBanner ? toPublicNoticeBanner(noticeBanner) : null
    },
    async getDashboard(account) {
      await service.assertAdmin(account)

      const rewardCodes = await findRecentRewardCodes()
      const noticeBanner = await findCurrentNoticeBanner()

      return {
        onlineAccounts: providers.getOnlineAccounts(),
        liveGames: providers.getLiveGames(),
        rewardCodes,
        noticeBanner: noticeBanner ? toAdminNoticeBanner(noticeBanner) : null,
      }
    },
    async setNoticeBanner(account, input) {
      const admin = await service.assertAdmin(account)
      const data = validateNoticeBannerInput(input)
      const noticeBanner = await store.adminNoticeBanner.create({
        data: {
          ...data,
          updatedByAccountId: admin.id,
        },
      })

      return {
        noticeBanner: toAdminNoticeBanner(noticeBanner),
        publicNoticeBanner: toPublicNoticeBanner(noticeBanner),
      }
    },
    async createChestRewardCode(account, input = {}) {
      const admin = await service.assertAdmin(account)
      const intendedAccountId = input.intendedAccountId || null
      const note = input.note?.trim() || null

      for (let attempt = 0; attempt < REWARD_CODE_MAX_ATTEMPTS; attempt += 1) {
        const code = generateRewardCode(random)

        try {
          const rewardCode = await store.adminRewardCode.create({
            data: {
              codeHash: hashRewardCode(code),
              codePreview: getCodePreview(code),
              createdByAccountId: admin.id,
              intendedAccountId,
              note,
            },
          })

          return {
            code,
            link: `${getPublicUrl()}/?code=${encodeURIComponent(code)}`,
            rewardCode: toRewardCodeSummary(rewardCode),
          }
        } catch (e) {
          if (isUniqueConstraintError(e)) {
            continue
          }
          throw e
        }
      }

      throw new SocketError("UNEXPECTED_ERROR", "No se pudo crear el codigo")
    },
    async redeemRewardCode(accountId, code) {
      const normalizedCode = normalizeRewardCode(code)

      if (!accountId || !normalizedCode) {
        throw new SocketError("REWARD_CODE_INVALID", "Codigo invalido")
      }

      const result = await store.$transaction(async (tx) => {
        const rewardCode = await tx.adminRewardCode.findUnique({
          where: { codeHash: hashRewardCode(normalizedCode) },
        })

        if (!rewardCode) {
          throw new SocketError("REWARD_CODE_INVALID", "Codigo invalido")
        }

        if (rewardCode.redeemedAt || rewardCode.treasureChestId) {
          throw new SocketError("REWARD_CODE_REDEEMED", "Este codigo ya fue usado")
        }

        if (rewardCode.intendedAccountId && rewardCode.intendedAccountId !== accountId) {
          throw new SocketError("FORBIDDEN", "Este codigo no pertenece a tu cuenta")
        }

        const redeemedAt = new Date()
        const claim = await tx.adminRewardCode.updateMany({
          where: { id: rewardCode.id, redeemedAt: null },
          data: { redeemedAt, redeemedByAccountId: accountId },
        })

        if (claim.count !== 1) {
          throw new SocketError("REWARD_CODE_REDEEMED", "Este codigo ya fue usado")
        }

        const chest = await tx.userTreasureChest.create({
          data: { accountId, sourceMatchId: null },
        })

        await tx.adminRewardCode.update({
          where: { id: rewardCode.id },
          data: { treasureChestId: chest.id },
        })

        return toTreasureChest(chest)
      })

      const treasureStatus = await TreasureService(store).getTreasureStatus(accountId)

      return {
        grantedChest: result,
        treasureStatus,
      }
    },
  }

  return service
}

export const AdminRewardCodeInternals = {
  hashRewardCode,
  normalizeRewardCode,
}
