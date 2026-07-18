import { readFileSync, readdirSync } from "fs"
import { resolve } from "path"
import { Writable } from "stream"
import { expect } from "chai"
import pino from "pino"
import { LOGGER_OPTIONS, safeErrorDetails } from "../../src/utils/logger"

describe("Log privacy", () => {
  it("projects raw external errors and redacts structured credential fields", () => {
    const chunks: string[] = []
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString())
        callback()
      },
    })
    const testLogger = pino({ ...LOGGER_OPTIONS, level: "trace" }, destination)

    const secrets = {
      reconnectSession: "canary-reconnect-session-8bb4",
      cookie: "Lightning-Application-Token=canary-email:canary-password",
      authorization: "Bearer canary-authorization-token",
      password: "canary-url-password",
      accessToken: "canary-access-token",
      refreshToken: "canary-refresh-token",
      applicationToken: "canary-application-token",
      seedHash: "canary-seed-hash",
      clientSecret: "canary-client-secret",
      macaroon: "canary-macaroon",
      apiKey: "canary-api-key",
      privateKey: "canary-private-key",
      credentials: "canary-credentials",
      url: "https://canary-user:canary-url-password@example.invalid/private",
      email: "canary-private-email@example.invalid",
      accountEmail: "canary-private-account-email@example.invalid",
      walletBalance: "canary-wallet-balance-987654321",
      balanceBefore: "canary-balance-before-123456789",
      balanceAfter: "canary-balance-after-234567890",
    }

    const axiosLikeError = Object.assign(new Error(`Request failed for ${secrets.url}`), {
      name: "AxiosError",
      code: "ERR_BAD_RESPONSE",
      config: {
        url: secrets.url,
        auth: { password: secrets.password },
        headers: {
          Cookie: secrets.cookie,
          Authorization: secrets.authorization,
          "set-cookie": secrets.cookie,
        },
      },
      response: {
        status: 502,
        data: {
          session: secrets.reconnectSession,
          Token: secrets.applicationToken,
        },
      },
    })

    testLogger.error(axiosLikeError, "External request failed")
    testLogger.child({ class: "ChildLoggerProbe" }).error(
      {
        name: "SocketError",
        code: "FORBIDDEN",
        message: secrets.authorization,
        config: { headers: { Cookie: secrets.cookie } },
      },
      "Plain error-like object failed"
    )
    testLogger.info(
      {
        session: secrets.reconnectSession,
        url: secrets.url,
        player: {
          session: secrets.reconnectSession,
          account: {
            Token: secrets.applicationToken,
            seedHash: secrets.seedHash,
          },
        },
        config: {
          auth: { password: secrets.password },
          headers: {
            Cookie: secrets.cookie,
            Authorization: secrets.authorization,
            "set-cookie": secrets.cookie,
          },
        },
        nested: {
          accessToken: secrets.accessToken,
          refreshToken: secrets.refreshToken,
          applicationToken: secrets.applicationToken,
          clientSecrets: [secrets.clientSecret],
          macaroon: secrets.macaroon,
          apiKey: secrets.apiKey,
          privateKey: secrets.privateKey,
          credentials: secrets.credentials,
          account: {
            email: secrets.email,
            accountEmail: secrets.accountEmail,
            wallet: { balanceInSats: secrets.walletBalance },
          },
          financial: {
            balanceBefore: secrets.balanceBefore,
            balanceAfter: secrets.balanceAfter,
          },
        },
      },
      "Structured redaction probe"
    )

    const output = chunks.join("")
    for (const secret of Object.values(secrets)) {
      expect(output).to.not.include(secret)
    }
    expect(output).to.include("ERR_BAD_RESPONSE")
    expect(output).to.include("FORBIDDEN")
    expect(output).to.include("AxiosError")
    expect(output).to.include("[Redacted]")
  })

  it("does not retain high-risk raw logging patterns in server sources", () => {
    const repositoryRoot = resolve(__dirname, "../..")
    const readTypeScriptSources = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = resolve(directory, entry.name)
        if (entry.isDirectory()) {
          return readTypeScriptSources(entryPath)
        }
        return entry.isFile() && entry.name.endsWith(".ts")
          ? [readFileSync(entryPath, "utf8")]
          : []
      })
    const source = readTypeScriptSources(resolve(repositoryRoot, "src")).join("\n")

    const forbiddenPatterns: Array<[string, RegExp]> = [
      ["session ID interpolation", /logger\.[a-z]+\([^)]*sessionID/],
      ["full socket user spread", /\.\.\.socket\.data\.user/],
      ["full socket user logging", /log\.debug\(socket\.data\.user/],
      ["credential-bearing environment URL logging", /Connecting to .*process\.env\.APP_.*URL/],
      ["upstream API URL field", /apiUrl:\s*process\.env/],
      ["upstream response body", /error:\s*e\.response\?\.data/],
      ["full match-player rows", /\{\s*players:\s*match\.players\s*\}/],
      ["full awarded match-player rows", /playersWithAwards/],
      ["database update containing session", /table\.log\.trace\(\{\s*update\s*\}/],
      ["full database player", /table\.log\.trace\(\{\s*dbPlayer\s*\}/],
      ["raw in-memory player", /player:\s*play\.player\s*[,}]/],
      ["raw table and session", /\{\s*session,\s*matchSessionId,\s*table\s*\}/],
      ["console error bypass", /console\.error\(e\)|\.catch\(console\.error\)/],
      ["arbitrary chat content", /log\.debug\(\{[^}]*\bmessage\s*[,}]/],
    ]

    for (const [label, pattern] of forbiddenPatterns) {
      expect(source, label).to.not.match(pattern)
    }

    const chatSource = readFileSync(
      resolve(repositoryRoot, "src/server/classes/Chat.ts"),
      "utf8"
    )
    expect(chatSource, "raw chat or SAY payload logging").to.not.match(
      /log\.(?:trace|debug|info|warn|error)\(\s*\{[^}]*\bmessage\s*[,}]/s
    )
    expect(chatSource, "raw adapter error logging").to.not.match(/error:\s*error\.message/)

    const middlewareSource = readFileSync(
      resolve(repositoryRoot, "src/server/middlewares/trucoshiMiddleware.ts"),
      "utf8"
    )
    expect(middlewareSource, "guest name interpolation in connection logs").to.not.match(
      /logger\.info\(\s*`[^`]*\$\{[^}]*\.name/s
    )
    expect(middlewareSource, "raw rejected subscription room logging").to.not.match(
      /log\.warn\(\{\s*socketId:\s*socket\.id,\s*room\s*\}/
    )
    expect(middlewareSource, "raw rejected chat room id logging").to.not.match(
      /log\.warn\(\{\s*socketId:\s*socket\.id,\s*roomId\s*\}/
    )

    const serverSource = readFileSync(
      resolve(repositoryRoot, "src/server/classes/Trucoshi.ts"),
      "utf8"
    )
    expect(serverSource, "raw rejected card logging").to.not.match(
      /safeErrorDetails\(e\),\s*card\s*[,}]/
    )
  })

  it("never includes an external error message or enumerable request configuration", () => {
    const error = Object.assign(new Error("canary-sensitive-error-message"), {
      code: "ERR_CANARY",
      config: { password: "canary-password" },
      response: { status: 401, data: { token: "canary-token" } },
    })

    expect(safeErrorDetails(error)).to.deep.equal({
      errorType: "Error",
      errorCode: "ERR_CANARY",
      status: 401,
    })
  })
})
