import { CARDS } from "../lib/constants"
import { EMatchState } from "../types"
import type { IJoinQueueOptions, ILobbyOptions, IWaitingPlayData } from "../types"
import { SocketError } from "./classes/SocketError"

export const MAX_CLIENT_IDENTIFIER_LENGTH = 128

// Keep client-controlled timeouts below Node's timer ceiling while preserving the
// long APP_DISABLE_TURN_TIMER development default (99,999,000 ms).
export const MAX_LOBBY_TIMING_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_HAND_ACK_TIME_MS = 24 * 60 * 60 * 1000

const LOBBY_OPTION_KEYS = new Set<keyof ILobbyOptions>([
  "maxPlayers",
  "faltaEnvido",
  "flor",
  "matchPoint",
  "handAckTime",
  "turnTime",
  "abandonTime",
  "satsPerPlayer",
])

const MATCH_FILTER_KEYS = new Set(["state"])
const MATCH_STATES = new Set(Object.values(EMatchState))

function fail(field: string): never {
  throw new SocketError("FORBIDDEN", `Invalid ${field}`)
}

export const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const hasOwn = (value: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key)

const isOneOf = (value: unknown, allowed: readonly unknown[]) => allowed.includes(value)

const assertPositiveBoundedInteger = (value: unknown, field: string, maximum: number) => {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > maximum
  ) {
    fail(field)
  }
}

export function assertJoinQueueOptions(value: unknown): asserts value is IJoinQueueOptions {
  if (!isPlainRecord(value)) {
    fail("queue options")
  }

  const keys = Object.keys(value)
  if (
    keys.length !== 2 ||
    !hasOwn(value, "maxPlayers") ||
    !hasOwn(value, "allowBots") ||
    keys.some((key) => key !== "maxPlayers" && key !== "allowBots")
  ) {
    fail("queue options")
  }

  if (!isOneOf(value.maxPlayers, [0, 2, 4, 6])) {
    fail("queue maxPlayers")
  }
  if (typeof value.allowBots !== "boolean") {
    fail("queue allowBots")
  }
}

export function assertMatchListFilters(
  value: unknown
): asserts value is { state?: Array<EMatchState> } {
  if (!isPlainRecord(value) || Object.keys(value).some((key) => !MATCH_FILTER_KEYS.has(key))) {
    fail("match filters")
  }

  if (
    hasOwn(value, "state") &&
    value.state !== undefined &&
    (!Array.isArray(value.state) ||
      value.state.length > MATCH_STATES.size ||
      value.state.some((state) => !MATCH_STATES.has(state)))
  ) {
    fail("match state filters")
  }
}

export function assertLobbyOptions(value: unknown): asserts value is Partial<ILobbyOptions> {
  if (!isPlainRecord(value)) {
    fail("lobby options")
  }

  for (const key of Object.keys(value)) {
    if (!LOBBY_OPTION_KEYS.has(key as keyof ILobbyOptions)) {
      fail("lobby options")
    }
  }

  if (hasOwn(value, "maxPlayers") && !isOneOf(value.maxPlayers, [2, 4, 6])) {
    fail("lobby maxPlayers")
  }
  if (hasOwn(value, "faltaEnvido") && !isOneOf(value.faltaEnvido, [1, 2])) {
    fail("lobby faltaEnvido")
  }
  if (hasOwn(value, "flor") && typeof value.flor !== "boolean") {
    fail("lobby flor")
  }
  if (hasOwn(value, "matchPoint") && !isOneOf(value.matchPoint, [9, 12, 15])) {
    fail("lobby matchPoint")
  }
  if (
    hasOwn(value, "satsPerPlayer") &&
    (!Number.isSafeInteger(value.satsPerPlayer) || (value.satsPerPlayer as number) < 0)
  ) {
    fail("lobby satsPerPlayer")
  }

  if (hasOwn(value, "handAckTime")) {
    assertPositiveBoundedInteger(value.handAckTime, "lobby handAckTime", MAX_HAND_ACK_TIME_MS)
  }
  for (const field of ["turnTime", "abandonTime"] as const) {
    if (hasOwn(value, field)) {
      assertPositiveBoundedInteger(value[field], `lobby ${field}`, MAX_LOBBY_TIMING_MS)
    }
  }
}

export function assertMatchCreationOptions(
  value: unknown
): asserts value is Partial<ILobbyOptions> & { createdFromQueue?: boolean } {
  if (!isPlainRecord(value)) {
    fail("match creation options")
  }

  const { createdFromQueue: _createdFromQueue, ...lobbyOptions } = value
  assertLobbyOptions(lobbyOptions)

  if (hasOwn(value, "createdFromQueue") && typeof value.createdFromQueue !== "boolean") {
    fail("createdFromQueue")
  }
}

export function normalizeOptionalTeamIndex(value: unknown): 0 | 1 | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  if (value !== 0 && value !== 1) {
    fail("teamIdx")
  }
  return value
}

export function assertBoolean(value: unknown, field: string): asserts value is boolean {
  if (typeof value !== "boolean") {
    fail(field)
  }
}

export function isWaitingPlayData(value: unknown): value is IWaitingPlayData {
  return (
    isPlainRecord(value) &&
    Number.isSafeInteger(value.cardIdx) &&
    (value.cardIdx as number) >= 0 &&
    (value.cardIdx as number) <= 2 &&
    typeof value.card === "string" &&
    Object.prototype.hasOwnProperty.call(CARDS, value.card)
  )
}

export function isStringIdentifier(value: unknown): value is string {
  return !(
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > MAX_CLIENT_IDENTIFIER_LENGTH ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
}

export function assertStringIdentifier(value: unknown, field: string): asserts value is string {
  if (!isStringIdentifier(value)) {
    fail(field)
  }
}

export function assertPositiveIntegerIdentifier(
  value: unknown,
  field: string
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    fail(field)
  }
}
