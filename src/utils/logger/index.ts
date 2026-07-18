import pino, { LoggerOptions } from "pino"

import * as dotenv from "dotenv"

dotenv.config()

const SENSITIVE_FIELD_NAMES = [
  "session",
  "userSession",
  "identity",
  "identityJwt",
  "token",
  "Token",
  "accessToken",
  "refreshToken",
  "applicationToken",
  "password",
  "secret",
  "seedHash",
  "clientSecret",
  "clientSecrets",
  "macaroon",
  "apiKey",
  "privateKey",
  "credentials",
  "authorization",
  "Authorization",
  "cookie",
  "Cookie",
  "url",
  "apiUrl",
  "email",
  "accountEmail",
  "codeHash",
  "rewardCode",
  "rewardLink",
  "wallet",
  "balance",
  "balanceInSats",
  "balanceBefore",
  "balanceAfter",
  "walletBalance",
] as const

const pathsAtDepth = (prefix: string) =>
  SENSITIVE_FIELD_NAMES.map((field) => (prefix ? `${prefix}.${field}` : field))

export const SENSITIVE_LOG_PATHS = [
  ...pathsAtDepth(""),
  ...pathsAtDepth("*"),
  ...pathsAtDepth("*.*"),
  "['set-cookie']",
  "*['set-cookie']",
  "*.*['set-cookie']",
  "players[*].session",
  "headers.authorization",
  "headers.Authorization",
  "headers.cookie",
  "headers.Cookie",
  "headers['set-cookie']",
  "config.headers.authorization",
  "config.headers.Authorization",
  "config.headers.cookie",
  "config.headers.Cookie",
  "config.headers['set-cookie']",
  "config.auth.password",
  "request.headers.authorization",
  "request.headers.Authorization",
  "request.headers.cookie",
  "request.headers.Cookie",
  "request.headers['set-cookie']",
] as const

const isErrorLike = (value: unknown): value is Error | Record<string, unknown> =>
  value instanceof Error ||
  (typeof value === "object" &&
    value !== null &&
    "message" in value &&
    ("code" in value ||
      "name" in value ||
      "stack" in value ||
      "config" in value ||
      "response" in value))

/** Keep operational classification while discarding external messages and bodies. */
export const safeErrorDetails = (error: unknown): Record<string, string | number> => {
  if (!isErrorLike(error)) {
    return { errorType: "UnknownError" }
  }

  const externalError = error as {
    name?: unknown
    code?: unknown
    status?: unknown
    response?: { status?: unknown }
  }
  const details: Record<string, string | number> = {
    errorType:
      typeof externalError.name === "string" && externalError.name ? externalError.name : "Error",
  }

  if (typeof externalError.code === "string" || typeof externalError.code === "number") {
    details.errorCode = externalError.code
  }
  const status = externalError.status ?? externalError.response?.status
  if (typeof status === "string" || typeof status === "number") {
    details.status = status
  }
  return details
}

export const LOGGER_OPTIONS: LoggerOptions = {
  level: process.env.APP_DEBUG_LEVEL || "info",
  redact: {
    paths: [...SENSITIVE_LOG_PATHS],
    censor: "[Redacted]",
  },
  hooks: {
    logMethod(args, method) {
      const safeArgs = isErrorLike(args[0]) ? [safeErrorDetails(args[0]), ...args.slice(1)] : args
      method.apply(this, safeArgs as Parameters<typeof method>)
    },
  },
}

const logger =
  process.env.NODE_ENV === "production"
    ? pino(LOGGER_OPTIONS)
    : pino(
        LOGGER_OPTIONS,
        pino.transport({
          target: "pino-pretty",
          options: { colorize: true, sync: process.env.NODE_ENV === "test" },
        })
      )

export default logger
