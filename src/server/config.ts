const DEFAULT_SERVER_PORT = 2992

export const DEVELOPMENT_OPS_TOKEN = "trucoshi-dev-ops-control-token"
export const DEVELOPMENT_OPS_STATUS_TOKEN = "trucoshi-dev-ops-status-token"

const parsePort = (value: string | undefined) => {
  if (!value) {
    return undefined
  }

  const port = Number(value)
  return Number.isInteger(port) && port >= 0 && port <= 65535 ? port : undefined
}

export const getServerPort = (environment: NodeJS.ProcessEnv = process.env) =>
  parsePort(environment.PORT) ?? parsePort(environment.APP_PORT) ?? DEFAULT_SERVER_PORT

export const getBetsEnabled = (environment: NodeJS.ProcessEnv = process.env) => {
  if (environment.APP_BETS_ENABLED === "1") {
    return true
  }
  if (environment.APP_BETS_ENABLED === "0") {
    return false
  }
  if (environment.APP_BETS_ENABLED) {
    return false
  }
  return environment.NODE_ENV !== "production"
}

export const getMaxBetSats = (environment: NodeJS.ProcessEnv = process.env) => {
  const value = environment.APP_MAX_BET
  if (value === undefined || value.trim() === "" || value === "0") {
    return undefined
  }

  const maxBet = Number(value)
  if (!Number.isSafeInteger(maxBet) || maxBet < 1) {
    throw new Error("APP_MAX_BET must be a positive safe integer or 0 to disable the cap")
  }
  return maxBet
}

export const getRakePercent = (environment: NodeJS.ProcessEnv = process.env) => {
  const value = environment.APP_RAKE_PERCENT
  if (value === undefined || value.trim() === "") {
    return 0
  }

  const rakePercent = Number(value)
  if (!Number.isFinite(rakePercent) || rakePercent < 0 || rakePercent > 100) {
    throw new Error("APP_RAKE_PERCENT must be a number between 0 and 100")
  }
  return rakePercent
}

export const validateOpsTokens = (
  opsToken: string | undefined,
  opsStatusToken: string | undefined,
  nodeEnv: string | undefined = process.env.NODE_ENV
) => {
  if ([opsToken, opsStatusToken].some((token) => token && /\s/.test(token))) {
    throw new Error("APP_OPS_TOKEN and APP_OPS_STATUS_TOKEN must not contain whitespace")
  }
  if (opsToken && opsStatusToken && opsToken === opsStatusToken) {
    throw new Error("APP_OPS_TOKEN and APP_OPS_STATUS_TOKEN must be different")
  }
  if (
    nodeEnv === "production" &&
    (opsToken === DEVELOPMENT_OPS_TOKEN || opsStatusToken === DEVELOPMENT_OPS_STATUS_TOKEN)
  ) {
    throw new Error("Development-only operations tokens cannot be used in production")
  }
}
