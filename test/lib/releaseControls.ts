import { execFileSync } from "child_process"
import { expect } from "chai"
import { readFileSync } from "fs"
import { request } from "http"
import { AddressInfo } from "net"
import { resolve } from "path"
import * as sinon from "sinon"
import { parseEnv } from "util"
import { accountsApi } from "../../src/accounts/client"
import { GAME_ERROR } from "../../src/types"
import { Trucoshi, TrucoshiSocket } from "../../src/server/classes"
import { Chat } from "../../src/server/classes/Chat"
import {
  DEVELOPMENT_OPS_STATUS_TOKEN,
  DEVELOPMENT_OPS_TOKEN,
  getBetsEnabled,
  getMaxBetSats,
  getRakePercent,
  validateOpsTokens,
} from "../../src/server/config"
import { RuntimeOpsStatus } from "../../src/server/RuntimeOps"
import { SocketError } from "../../src/server/classes/SocketError"

const requestJson = (
  port: number,
  path: string,
  options: { method?: string; token?: string } = {}
) =>
  new Promise<{ body: any; statusCode: number }>((resolve, reject) => {
    const httpRequest = request(
      {
        host: "127.0.0.1",
        method: options.method || "GET",
        path,
        port,
        headers: options.token ? { Authorization: `Bearer ${options.token}` } : undefined,
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
        response.on("end", () => {
          try {
            resolve({
              body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
              statusCode: response.statusCode || 0,
            })
          } catch (error) {
            reject(error)
          }
        })
      }
    )
    httpRequest.on("error", reject)
    httpRequest.end()
  })

const createSocket = (id: string) =>
  ({
    id,
    data: { matches: new Set<string>() },
    emit: sinon.stub(),
    join: sinon.stub(),
    leave: sinon.stub(),
  }) as unknown as TrucoshiSocket

const captureError = async (operation: () => Promise<unknown>) => {
  try {
    await operation()
  } catch (error) {
    return error
  }
  throw new Error("Expected operation to fail")
}

describe("Release controls", () => {
  it("ships valid local development operations tokens", () => {
    const environment = parseEnv(readFileSync(resolve(process.cwd(), ".env.example"), "utf8"))
    const opsToken = environment.APP_OPS_TOKEN || ""
    const opsStatusToken = environment.APP_OPS_STATUS_TOKEN || ""

    expect(environment.NODE_ENV).to.equal("development")
    expect(environment.APP_PORT).to.equal("2992")
    expect(environment.APP_ORIGIN).to.equal("http://localhost:2991")
    expect(environment.APP_LIGHTNING_ACCOUNTS_URL).to.equal("http://localhost:2999/v1")
    expect(environment.APP_LIGHTNING_ACCOUNTS_EMAIL).not.to.equal("")
    expect(environment.APP_LIGHTNING_ACCOUNTS_PASSWORD).not.to.equal("")
    expect(environment.APP_BETS_ENABLED).to.equal("1")
    expect(opsToken).to.equal(DEVELOPMENT_OPS_TOKEN)
    expect(opsStatusToken).to.equal(DEVELOPMENT_OPS_STATUS_TOKEN)
    expect(opsToken).to.match(/^\S+$/)
    expect(opsStatusToken).to.match(/^\S+$/)
    expect(opsToken).not.to.equal(opsStatusToken)
  })

  it("validates the full development launcher configuration", () => {
    const launcherPath = resolve(process.cwd(), "init-dev-all.sh")
    const launcher = readFileSync(launcherPath, "utf8")
    const nodemon = JSON.parse(
      readFileSync(resolve(process.cwd(), "nodemon.json"), "utf8")
    ) as { exec?: string }

    execFileSync("bash", ["-n", launcherPath])
    expect(launcher).to.contain('install -m 600 "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"')
    expect(launcher).to.contain('require_bearer_token APP_OPS_TOKEN "$CLIENT_OPS_TOKEN"')
    expect(launcher).to.contain(
      'require_bearer_token APP_OPS_STATUS_TOKEN "$CLIENT_OPS_STATUS_TOKEN"'
    )
    expect(launcher).to.contain('export TRUCOSHI_OPS_STATUS_TOKEN="$status_token"')
    expect(launcher).to.contain('export VITE_ENABLE_BETS_AND_DEPOSITS="$bets_enabled"')
    expect(launcher).to.contain(
      'export VITE_LIGHTNING_ACCOUNTS_COOKIE_PREFIX="$cookie_prefix"'
    )
    expect(launcher).to.contain('"http://localhost:2991/admission.json"')
    expect(launcher).to.contain("status.admission === \"accepting\"")
    expect(launcher).to.contain("status.available === true")
    expect(launcher).to.contain("status.acceptingNewGames === true")
    expect(launcher).not.to.match(/VITE_[A-Z0-9_]*OPS[A-Z0-9_]*TOKEN/)
    expect(nodemon.exec).to.equal("yarn build && node --trace-warnings ./bin/trucoshi-server")
  })

  it("accepts local operations defaults only outside production", () => {
    expect(() =>
      validateOpsTokens(DEVELOPMENT_OPS_TOKEN, DEVELOPMENT_OPS_STATUS_TOKEN, "development")
    ).not.to.throw()
    expect(() => validateOpsTokens("token with spaces", "status-token", "development")).to.throw(
      "must not contain whitespace"
    )
    expect(() =>
      validateOpsTokens(DEVELOPMENT_OPS_TOKEN, DEVELOPMENT_OPS_STATUS_TOKEN, "production")
    ).to.throw("cannot be used in production")
  })

  it("resolves APP_BETS_ENABLED explicitly and fails closed for invalid values", () => {
    expect(getBetsEnabled({ NODE_ENV: "production", APP_BETS_ENABLED: "1" })).to.equal(true)
    expect(getBetsEnabled({ NODE_ENV: "test", APP_BETS_ENABLED: "0" })).to.equal(false)
    expect(getBetsEnabled({ NODE_ENV: "production" })).to.equal(false)
    expect(getBetsEnabled({ NODE_ENV: "development" })).to.equal(true)
    expect(getBetsEnabled({ NODE_ENV: "test" })).to.equal(true)
    expect(getBetsEnabled({ NODE_ENV: "development", APP_BETS_ENABLED: "true" })).to.equal(false)
  })

  it("validates the maximum bet and rake configuration", () => {
    expect(getMaxBetSats({ APP_MAX_BET: "1000" })).to.equal(1000)
    expect(getMaxBetSats({ APP_MAX_BET: "0" })).to.equal(undefined)
    expect(getMaxBetSats({})).to.equal(undefined)
    expect(() => getMaxBetSats({ APP_MAX_BET: "1.5" })).to.throw("positive safe integer")
    expect(() => getMaxBetSats({ APP_MAX_BET: "-1" })).to.throw("positive safe integer")

    expect(getRakePercent({ APP_RAKE_PERCENT: "0" })).to.equal(0)
    expect(getRakePercent({ APP_RAKE_PERCENT: "2.5" })).to.equal(2.5)
    expect(() => getRakePercent({ APP_RAKE_PERCENT: "101" })).to.throw("between 0 and 100")
    expect(() => getRakePercent({ APP_RAKE_PERCENT: "nan" })).to.throw("between 0 and 100")
  })

  it("keeps read-only and mutating operations credentials separate", () => {
    expect(() =>
      Trucoshi({
        opsToken: "same-token",
        opsStatusToken: "same-token",
        port: 0,
        serverVersion: "ops-token-validation",
      })
    ).to.throw("must be different")
  })

  it("rejects nonzero match options before any Lightning wallet operation", async () => {
    const server = Trucoshi({
      betsEnabled: false,
      opsToken: "",
      port: 0,
      serverVersion: "bets-disabled-test",
    })
    const createPayRequests = sinon.spy(accountsApi.wallet, "createPayRequests")
    const getPayRequest = sinon.spy(accountsApi.wallet, "getPayRequest")
    const payUser = sinon.spy(accountsApi.wallet, "payUser")

    try {
      await server.listen(() => undefined, {
        redis: false,
        lightningAccounts: false,
        store: false,
      })

      const socket = createSocket("bets-owner")
      const userSession = server.createUserSession(socket, "bets-owner", "bets-owner")

      const createError = await captureError(() =>
        server.createMatchTable(userSession, socket, { satsPerPlayer: 1 })
      )
      expect(createError).to.be.instanceOf(SocketError)
      expect((createError as SocketError).code).to.equal(GAME_ERROR.FORBIDDEN)

      const invalidBetError = await captureError(() =>
        server.createMatchTable(userSession, socket, { satsPerPlayer: -1 })
      )
      expect(invalidBetError).to.be.instanceOf(SocketError)
      expect((invalidBetError as SocketError).code).to.equal(GAME_ERROR.FORBIDDEN)

      const table = await server.createMatchTable(userSession, socket)
      const optionsError = await captureError(() =>
        server.setMatchOptions({
          matchSessionId: table.matchSessionId,
          options: { satsPerPlayer: 10 },
          socket,
          userSession,
        })
      )
      expect(optionsError).to.be.instanceOf(SocketError)
      expect((optionsError as SocketError).code).to.equal(GAME_ERROR.FORBIDDEN)
      expect(table.lobby.options.satsPerPlayer).to.equal(0)
      expect(createPayRequests.called).to.equal(false)
      expect(getPayRequest.called).to.equal(false)
      expect(payUser.called).to.equal(false)
    } finally {
      createPayRequests.restore()
      getPayRequest.restore()
      payUser.restore()
      await server.close()
    }
  })

  it("enforces a configured maximum bet before creating a table", async () => {
    const server = Trucoshi({
      betsEnabled: true,
      maxBetSats: 100,
      opsToken: "",
      port: 0,
      serverVersion: "max-bet-test",
    })

    try {
      await server.listen(() => undefined, {
        redis: false,
        lightningAccounts: false,
        store: false,
      })
      const socket = createSocket("max-bet-owner")
      const owner = server.createUserSession(socket, "max-bet-owner", "max-bet-owner")
      const error = await captureError(() =>
        server.createMatchTable(owner, socket, { satsPerPlayer: 101 })
      )
      expect(error).to.be.instanceOf(SocketError)
      expect((error as SocketError).code).to.equal(GAME_ERROR.FORBIDDEN)
    } finally {
      await server.close()
    }
  })

  it("waits for an in-flight admission lease before completing a drain", async () => {
    const server = Trucoshi({ port: 0, serverVersion: "admission-lease-test" })
    const socket = createSocket("lease-owner")
    const owner = server.createUserSession(socket, "lease-owner", "lease-owner")
    let releaseCreate: (() => void) | undefined
    let signalCreateStarted!: () => void
    const createStarted = new Promise<void>((resolve) => {
      signalCreateStarted = resolve
    })
    const create = sinon.stub().callsFake(() => {
      signalCreateStarted()
      return new Promise<{ id: number }>((resolve) => {
        releaseCreate = () => resolve({ id: 1 })
      })
    })
    server.store = {
      match: { create },
      $disconnect: sinon.stub().resolves(),
    } as any
    server.chat = Chat(server.io, server.tables)

    try {
      const creation = server.createMatchTable(owner, socket)
      await Promise.race([
        createStarted,
        creation.then(() => {
          throw new Error("Match creation completed before persistence started")
        }),
      ])

      let drainCompleted = false
      const drain = server.drainAdmission().then((status) => {
        drainCompleted = true
        return status
      })
      await new Promise<void>((resolve) => setImmediate(resolve))

      expect(server.getOpsStatus().counts.inFlightAdmissions).to.equal(1)
      expect(drainCompleted).to.equal(false)

      releaseCreate?.()
      await creation
      const drained = await drain
      expect(drained.acceptingNewGames).to.equal(false)
      expect(drained.counts.inFlightAdmissions).to.equal(0)
    } finally {
      releaseCreate?.()
      await server.close()
    }
  })

  it("authenticates drain controls without changing readiness and resumes admission", async () => {
    const environment = parseEnv(
      readFileSync(resolve(process.cwd(), ".env.example"), "utf8")
    )
    const opsToken = environment.APP_OPS_TOKEN || ""
    const opsStatusToken = environment.APP_OPS_STATUS_TOKEN || ""
    const server = Trucoshi({
      betsEnabled: false,
      opsToken,
      opsStatusToken,
      port: 0,
      serverVersion: "ops-test",
    })

    try {
      await server.listen(() => undefined, {
        redis: false,
        lightningAccounts: false,
        store: false,
      })

      const address = server.httpServer.address() as AddressInfo
      expect((await requestJson(address.port, "/ops/status")).statusCode).to.equal(401)
      expect(
        (await requestJson(address.port, "/ops/status", { token: "wrong-token" })).statusCode
      ).to.equal(401)

      const ownerSocket = createSocket("ops-owner")
      const owner = server.createUserSession(ownerSocket, "ops-owner", "ops-owner")
      const waitingTable = await server.createMatchTable(owner, ownerSocket)

      const queuedSocket = createSocket("queued-player")
      const queuedUser = server.createUserSession(queuedSocket, "queued-player", "queued-player")
      await server.joinQueue({
        socket: queuedSocket,
        userSession: queuedUser,
        options: { maxPlayers: 6, allowBots: false },
      })

      expect(
        (await requestJson(address.port, "/ops/status", { token: opsToken })).statusCode
      ).to.equal(401)

      const accepting = await requestJson(address.port, "/ops/status", {
        token: opsStatusToken,
      })
      expect(accepting.statusCode).to.equal(200)
      expect(accepting.body).to.deep.equal({
        version: "ops-test",
        admission: "accepting",
        acceptingNewGames: true,
        betsEnabled: false,
        counts: {
          activeMatches: 0,
          waitingMatches: 1,
          activePlayers: 0,
          waitingPlayers: 1,
          queuedPlayers: 1,
          queueProposals: 0,
          inFlightAdmissions: 0,
        },
      } satisfies RuntimeOpsStatus)

      expect(
        (
          await requestJson(address.port, "/ops/drain", {
            method: "POST",
            token: opsStatusToken,
          })
        ).statusCode
      ).to.equal(401)

      const drained = await requestJson(address.port, "/ops/drain", {
        method: "POST",
        token: opsToken,
      })
      expect(drained.statusCode).to.equal(200)
      expect(drained.body).to.deep.include({
        admission: "draining",
        acceptingNewGames: false,
      })
      expect(drained.body.counts).to.deep.include({ queuedPlayers: 0, queueProposals: 0 })

      const ready = await requestJson(address.port, "/health/ready")
      expect(ready.statusCode).to.equal(200)
      expect(ready.body).to.deep.include({ ready: true, draining: false })

      const blockedCreate = await captureError(() => server.createMatchTable(owner, ownerSocket))
      expect((blockedCreate as SocketError).code).to.equal(GAME_ERROR.FORBIDDEN)

      const blockedQueue = await captureError(() =>
        server.joinQueue({
          socket: queuedSocket,
          userSession: queuedUser,
          options: { maxPlayers: 6, allowBots: false },
        })
      )
      expect((blockedQueue as SocketError).code).to.equal(GAME_ERROR.FORBIDDEN)

      const newcomerSocket = createSocket("newcomer")
      const newcomer = server.createUserSession(newcomerSocket, "newcomer", "newcomer")
      const blockedJoin = await captureError(() =>
        server.joinMatch(waitingTable, newcomer, newcomerSocket, 1)
      )
      expect((blockedJoin as SocketError).code).to.equal(GAME_ERROR.FORBIDDEN)

      const existingPlayer = waitingTable.isSessionPlaying(owner.session)
      const reconnectedPlayer = await server.joinMatch(waitingTable, owner, ownerSocket, 0)
      expect(reconnectedPlayer).to.equal(existingPlayer)

      const blockedStart = await captureError(() =>
        server.startMatch({
          identityJwt: null,
          matchSessionId: waitingTable.matchSessionId,
          userSession: owner,
        })
      )
      expect((blockedStart as SocketError).code).to.equal(GAME_ERROR.FORBIDDEN)

      const resumed = await requestJson(address.port, "/ops/resume", {
        method: "POST",
        token: opsToken,
      })
      expect(resumed.statusCode).to.equal(200)
      expect(resumed.body).to.deep.include({
        admission: "accepting",
        acceptingNewGames: true,
      })

      const newTable = await server.createMatchTable(newcomer, newcomerSocket)
      expect(newTable.isSessionPlaying(newcomer.session)).not.to.equal(null)
    } finally {
      await server.close()
    }
  })
})
