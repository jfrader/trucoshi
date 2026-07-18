import { IncomingMessage, ServerResponse } from "http"

export type RuntimeDependency = "redis" | "postgres" | "lightningAccounts"
export type RuntimeDependencyStatus = "disabled" | "initializing" | "ready" | "failed"

export interface RuntimeDependencyState {
  requested: boolean
  status: RuntimeDependencyStatus
}

export interface RuntimeHealthSnapshot {
  version: string
  live: boolean
  ready: boolean
  readiness: "initializing" | "ready" | "draining" | "unavailable"
  draining: boolean
  dependencies: Record<RuntimeDependency, RuntimeDependencyState>
}

export interface RuntimeDependencyOptions {
  redis: boolean
  postgres: boolean
  lightningAccounts: boolean
}

const dependencyState = (requested: boolean): RuntimeDependencyState => ({
  requested,
  status: requested ? "initializing" : "disabled",
})

export class RuntimeHealth {
  private serving = false
  private initialized = false
  private isDraining = false
  private dependencyStates: Record<RuntimeDependency, RuntimeDependencyState>

  constructor(private readonly version: string) {
    this.dependencyStates = {
      redis: dependencyState(false),
      postgres: dependencyState(false),
      lightningAccounts: dependencyState(false),
    }
  }

  configureDependencies(options: RuntimeDependencyOptions) {
    this.initialized = false
    this.dependencyStates = {
      redis: dependencyState(options.redis),
      postgres: dependencyState(options.postgres),
      lightningAccounts: dependencyState(options.lightningAccounts),
    }
  }

  markServing() {
    this.serving = true
  }

  markStopped() {
    this.serving = false
  }

  markDependencyReady(dependency: RuntimeDependency) {
    if (this.dependencyStates[dependency].requested) {
      this.dependencyStates[dependency].status = "ready"
    }
  }

  markDependencyFailed(dependency: RuntimeDependency) {
    if (this.dependencyStates[dependency].requested) {
      this.dependencyStates[dependency].status = "failed"
    }
  }

  completeInitialization() {
    this.initialized = true
  }

  beginDraining() {
    this.isDraining = true
  }

  snapshot(): RuntimeHealthSnapshot {
    const dependencies = {
      redis: { ...this.dependencyStates.redis },
      postgres: { ...this.dependencyStates.postgres },
      lightningAccounts: { ...this.dependencyStates.lightningAccounts },
    }
    const dependenciesReady = Object.values(dependencies).every(
      ({ status }) => status === "ready" || status === "disabled"
    )
    const ready = this.serving && this.initialized && !this.isDraining && dependenciesReady
    const readiness = this.isDraining
      ? "draining"
      : ready
        ? "ready"
        : this.initialized
          ? "unavailable"
          : "initializing"

    return {
      version: this.version,
      live: this.serving,
      ready,
      readiness,
      draining: this.isDraining,
      dependencies,
    }
  }
}

const writeJson = (response: ServerResponse, statusCode: number, body: unknown) => {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  })
  response.end(JSON.stringify(body))
}

export const createHealthRequestHandler = (health: RuntimeHealth) => {
  return (request: IncomingMessage, response: ServerResponse) => {
    const path = request.url?.split("?", 1)[0]
    const isLiveness = request.method === "GET" && path === "/health/live"
    const isReadiness = request.method === "GET" && (path === "/health" || path === "/health/ready")

    if (!isLiveness && !isReadiness) {
      writeJson(response, 404, { error: "Not found" })
      return
    }

    const snapshot = health.snapshot()
    const healthy = isLiveness ? snapshot.live : snapshot.ready
    writeJson(response, healthy ? 200 : 503, snapshot)
  }
}
