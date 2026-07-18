import { createHash, timingSafeEqual } from "crypto"
import { IncomingMessage, ServerResponse } from "http"
import { createHealthRequestHandler, RuntimeHealth } from "./RuntimeHealth"

export type RuntimeAdmissionState = "accepting" | "draining"

export interface RuntimeOpsCounts {
  activeMatches: number
  waitingMatches: number
  activePlayers: number
  waitingPlayers: number
  queuedPlayers: number
  queueProposals: number
  inFlightAdmissions: number
}

export interface RuntimeOpsStatus {
  version: string
  admission: RuntimeAdmissionState
  acceptingNewGames: boolean
  betsEnabled: boolean
  counts: RuntimeOpsCounts
}

interface RuntimeOpsHandlers {
  /** Read/write credential used only by drain and resume. */
  token?: string
  /** Read-only credential used only by the status endpoint. */
  statusToken?: string
  getStatus(): RuntimeOpsStatus
  drain(): Promise<RuntimeOpsStatus>
  resume(): Promise<RuntimeOpsStatus>
}

const writeJson = (
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {}
) => {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  })
  response.end(JSON.stringify(body))
}

const isAuthorized = (request: IncomingMessage, configuredToken: string) => {
  const authorization = request.headers.authorization
  const match = authorization?.match(/^Bearer ([^\s]+)$/i)
  if (!match) {
    return false
  }

  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest()
  return timingSafeEqual(digest(match[1]), digest(configuredToken))
}

export const createRuntimeRequestHandler = (
  health: RuntimeHealth,
  operations: RuntimeOpsHandlers
) => {
  const healthHandler = createHealthRequestHandler(health)

  return async (request: IncomingMessage, response: ServerResponse) => {
    const path = request.url?.split("?", 1)[0]
    const isOpsPath = path === "/ops/status" || path === "/ops/drain" || path === "/ops/resume"

    if (!isOpsPath) {
      healthHandler(request, response)
      return
    }

    const configuredToken = path === "/ops/status" ? operations.statusToken : operations.token

    if (!configuredToken) {
      writeJson(response, 503, { error: "Operations endpoint is not configured" })
      return
    }

    if (!isAuthorized(request, configuredToken)) {
      writeJson(response, 401, { error: "Unauthorized" }, { "WWW-Authenticate": "Bearer" })
      return
    }

    if (request.method === "GET" && path === "/ops/status") {
      writeJson(response, 200, operations.getStatus())
      return
    }

    const operation =
      request.method === "POST" && path === "/ops/drain"
        ? operations.drain
        : request.method === "POST" && path === "/ops/resume"
          ? operations.resume
          : undefined

    if (!operation) {
      writeJson(response, 405, { error: "Method not allowed" })
      return
    }

    try {
      writeJson(response, 200, await operation())
    } catch {
      writeJson(response, 500, { error: "Operations transition failed" })
    }
  }
}
