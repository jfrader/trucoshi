import { expect } from "chai"
import { get } from "http"
import { AddressInfo } from "net"
import * as sinon from "sinon"
import { accountsApi } from "../../src/accounts/client"
import { Trucoshi } from "../../src/server/classes"
import { getServerPort } from "../../src/server/config"
import { RuntimeHealth, RuntimeHealthSnapshot } from "../../src/server/RuntimeHealth"
import logger from "../../src/utils/logger"

const requestHealth = (port: number, path: string) =>
  new Promise<{ body: RuntimeHealthSnapshot; statusCode: number }>((resolve, reject) => {
    const request = get({ host: "127.0.0.1", path, port }, (response) => {
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
    })
    request.on("error", reject)
  })

describe("Runtime health", () => {
  it("uses PORT before APP_PORT and falls back safely", () => {
    expect(getServerPort({ PORT: "4100", APP_PORT: "4200" })).to.equal(4100)
    expect(getServerPort({ PORT: "invalid", APP_PORT: "4200" })).to.equal(4200)
    expect(getServerPort({ PORT: "70000", APP_PORT: "invalid" })).to.equal(2992)
  })

  it("treats disabled dependencies as healthy and requested failures as unavailable", () => {
    const health = new RuntimeHealth("test-version")
    health.configureDependencies({ redis: false, postgres: false, lightningAccounts: false })
    health.markServing()
    health.completeInitialization()

    expect(health.snapshot()).to.deep.include({
      version: "test-version",
      live: true,
      ready: true,
      readiness: "ready",
      draining: false,
    })
    expect(health.snapshot().dependencies.redis.status).to.equal("disabled")

    health.configureDependencies({ redis: true, postgres: false, lightningAccounts: false })
    health.markDependencyFailed("redis")
    health.completeInitialization()

    expect(health.snapshot().ready).to.equal(false)
    expect(health.snapshot().readiness).to.equal("unavailable")
  })

  it("serves health endpoints and becomes unready before an idempotent close", async () => {
    const server = Trucoshi({ port: 0, serverVersion: "health-test" })

    await server.listen(() => undefined, {
      redis: false,
      lightningAccounts: false,
      store: false,
    })

    const address = server.httpServer.address() as AddressInfo

    try {
      const live = await requestHealth(address.port, "/health/live")
      const ready = await requestHealth(address.port, "/health/ready")
      const alias = await requestHealth(address.port, "/health")

      expect(live.statusCode).to.equal(200)
      expect(ready.statusCode).to.equal(200)
      expect(alias.statusCode).to.equal(200)
      expect(ready.body).to.deep.include({
        version: "health-test",
        live: true,
        ready: true,
        readiness: "ready",
        draining: false,
      })
      expect(ready.body.dependencies).to.deep.equal({
        redis: { requested: false, status: "disabled" },
        postgres: { requested: false, status: "disabled" },
        lightningAccounts: { requested: false, status: "disabled" },
      })

      server.markDraining()
      const draining = await requestHealth(address.port, "/health/ready")
      const drainingLive = await requestHealth(address.port, "/health/live")
      expect(draining.statusCode).to.equal(503)
      expect(draining.body).to.deep.include({
        live: true,
        ready: false,
        readiness: "draining",
        draining: true,
      })
      expect(drainingLive.statusCode).to.equal(200)

      const firstClose = server.close()
      const secondClose = server.close()
      expect(secondClose).to.equal(firstClose)
      await firstClose
      expect(server.health.snapshot().live).to.equal(false)
    } finally {
      await server.close()
    }
  })

  it("keeps liveness serving when a requested dependency fails initialization", async () => {
    const errorStub = sinon.stub(logger, "error")
    const profileStub = sinon
      .stub(accountsApi.auth, "getUserProfile")
      .rejects(new Error("expected initialization failure"))
    const server = Trucoshi({ port: 0, serverVersion: "failed-health-test" })

    try {
      await server.listen(() => undefined, {
        redis: false,
        lightningAccounts: true,
        store: false,
      })

      const address = server.httpServer.address() as AddressInfo
      const live = await requestHealth(address.port, "/health/live")
      const ready = await requestHealth(address.port, "/health/ready")

      expect(profileStub.calledOnce).to.equal(true)
      expect(live.statusCode).to.equal(200)
      expect(ready.statusCode).to.equal(503)
      expect(ready.body).to.deep.include({
        version: "failed-health-test",
        live: true,
        ready: false,
        readiness: "unavailable",
        draining: false,
      })
      expect(ready.body.dependencies.lightningAccounts).to.deep.equal({
        requested: true,
        status: "failed",
      })
    } finally {
      profileStub.restore()
      errorStub.restore()
      await server.close()
    }
  })
})
