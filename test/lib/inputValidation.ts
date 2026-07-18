import { expect } from "chai"
import * as sinon from "sinon"
import {
  MAX_CLIENT_IDENTIFIER_LENGTH,
  MAX_HAND_ACK_TIME_MS,
  MAX_LOBBY_TIMING_MS,
  assertBoolean,
  assertJoinQueueOptions,
  assertLobbyOptions,
  assertMatchListFilters,
  assertMatchCreationOptions,
  isWaitingPlayData,
  normalizeOptionalTeamIndex,
  assertPositiveIntegerIdentifier,
  assertStringIdentifier,
} from "../../src/server/InputValidation"
import { Chat, SocketError, Trucoshi, TrucoshiSocket } from "../../src/server/classes"
import { EMatchState, GAME_ERROR } from "../../src/types"

const expectForbidden = (operation: () => unknown) => {
  try {
    operation()
  } catch (error) {
    expect(error).to.be.instanceOf(SocketError)
    expect((error as SocketError).code).to.equal(GAME_ERROR.FORBIDDEN)
    return
  }
  throw new Error("Expected input validation to reject the value")
}

const expectForbiddenAsync = async (operation: () => Promise<unknown>) => {
  try {
    await operation()
  } catch (error) {
    expect(error).to.be.instanceOf(SocketError)
    expect((error as SocketError).code).to.equal(GAME_ERROR.FORBIDDEN)
    return
  }
  throw new Error("Expected input validation to reject the value")
}

const createSocket = (id: string) =>
  ({
    id,
    data: { matches: new Set<string>() },
    emit: sinon.stub(),
    join: sinon.stub(),
    leave: sinon.stub(),
  }) as unknown as TrucoshiSocket

describe("Client input validation", () => {
  it("accepts only complete, exact queue option objects", () => {
    for (const maxPlayers of [0, 2, 4, 6]) {
      assertJoinQueueOptions({ maxPlayers, allowBots: true })
      assertJoinQueueOptions({ maxPlayers, allowBots: false })
    }

    for (const value of [
      null,
      [],
      {},
      { maxPlayers: 2 },
      { maxPlayers: 2, allowBots: false, unexpected: true },
      { maxPlayers: 3, allowBots: false },
      { maxPlayers: "2", allowBots: false },
      { maxPlayers: 2, allowBots: 0 },
    ]) {
      expectForbidden(() => assertJoinQueueOptions(value))
    }
  })

  it("accepts the supported lobby rules and bounded integer timings", () => {
    assertLobbyOptions({})
    assertLobbyOptions({
      maxPlayers: 6,
      faltaEnvido: 2,
      flor: false,
      matchPoint: 15,
      handAckTime: MAX_HAND_ACK_TIME_MS,
      turnTime: 99_999_000,
      abandonTime: MAX_LOBBY_TIMING_MS,
      satsPerPlayer: Number.MAX_SAFE_INTEGER,
    })

    for (const value of [
      null,
      [],
      { unexpected: true },
      { createdFromQueue: true },
      { maxPlayers: 3 },
      { maxPlayers: "2" },
      { faltaEnvido: 0 },
      { faltaEnvido: false },
      { flor: 1 },
      { matchPoint: 30 },
      { matchPoint: 9.5 },
      { satsPerPlayer: -1 },
      { satsPerPlayer: 1.5 },
      { satsPerPlayer: Number.MAX_SAFE_INTEGER + 1 },
      { handAckTime: 0 },
      { handAckTime: MAX_HAND_ACK_TIME_MS + 1 },
      { turnTime: 1.5 },
      { abandonTime: MAX_LOBBY_TIMING_MS + 1 },
    ]) {
      expectForbidden(() => assertLobbyOptions(value))
    }
  })

  it("accepts only exact, bounded public match filters", () => {
    assertMatchListFilters({})
    assertMatchListFilters({ state: [] })
    assertMatchListFilters({ state: [EMatchState.STARTED] })

    for (const value of [
      null,
      [],
      { unexpected: true },
      { state: null },
      { state: EMatchState.STARTED },
      { state: ["INVALID_MATCH_STATE"] },
      { state: Array(Object.values(EMatchState).length + 1).fill(EMatchState.STARTED) },
    ]) {
      expectForbidden(() => assertMatchListFilters(value))
    }
  })

  it("keeps internal queue metadata separate from public lobby options", () => {
    assertMatchCreationOptions({ createdFromQueue: true, maxPlayers: 4, satsPerPlayer: 0 })
    assertMatchCreationOptions({ createdFromQueue: false })

    expectForbidden(() => assertMatchCreationOptions({ createdFromQueue: "true" }))
    expectForbidden(() =>
      assertMatchCreationOptions({ createdFromQueue: true, unexpected: true })
    )
  })

  it("validates team indexes, booleans, and bounded identifiers without coercion", () => {
    expect(normalizeOptionalTeamIndex(undefined)).to.equal(undefined)
    expect(normalizeOptionalTeamIndex(null)).to.equal(undefined)
    expect(normalizeOptionalTeamIndex(0)).to.equal(0)
    expect(normalizeOptionalTeamIndex(1)).to.equal(1)
    assertBoolean(false, "ready")
    assertBoolean(true, "pause")
    assertStringIdentifier("match-123", "matchSessionId")
    assertStringIdentifier("a".repeat(MAX_CLIENT_IDENTIFIER_LENGTH), "matchSessionId")
    assertPositiveIntegerIdentifier(1, "matchId")
    assertPositiveIntegerIdentifier(Number.MAX_SAFE_INTEGER, "accountId")

    for (const value of [false, -1, 2, "0", "", {}]) {
      expectForbidden(() => normalizeOptionalTeamIndex(value))
    }
    for (const value of [null, 0, 1, "false"]) {
      expectForbidden(() => assertBoolean(value, "ready"))
    }
    for (const value of [
      null,
      123,
      "",
      " match-123",
      "match-123\n",
      "a".repeat(MAX_CLIENT_IDENTIFIER_LENGTH + 1),
    ]) {
      expectForbidden(() => assertStringIdentifier(value, "matchSessionId"))
    }
    for (const value of [null, "1", 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expectForbidden(() => assertPositiveIntegerIdentifier(value, "matchId"))
    }
  })

  it("accepts only bounded real-card play acknowledgements", () => {
    expect(isWaitingPlayData({ cardIdx: 0, card: "1e" })).to.equal(true)
    expect(isWaitingPlayData({ cardIdx: 2, card: "4c", clientMetadata: true })).to.equal(true)

    expect(isWaitingPlayData({ cardIdx: "0", card: "1e" })).to.equal(false)
    expect(isWaitingPlayData({ cardIdx: 3, card: "1e" })).to.equal(false)
    expect(isWaitingPlayData({ cardIdx: 0, card: "xx" })).to.equal(false)
    expect(isWaitingPlayData({ cardIdx: 0, card: "raw-invalid-card-canary" })).to.equal(false)
    expect(isWaitingPlayData(null)).to.equal(false)
  })

  it("enforces validators at the server method boundary before state changes", async () => {
    const server = Trucoshi({ port: 0, serverVersion: "input-validation-test" })
    const socket = createSocket("validation-owner")
    const owner = server.createUserSession(socket, "validation-owner", "validation-owner")

    try {
      await expectForbiddenAsync(() =>
        server.joinQueue({
          socket,
          userSession: owner,
          options: { maxPlayers: 2, allowBots: "yes" } as any,
        })
      )
      await expectForbiddenAsync(() =>
        server.createMatchTable(owner, socket, { matchPoint: 30 } as any)
      )
      await expectForbiddenAsync(() => server.addBot({} as any, owner, 2 as any))
      await expectForbiddenAsync(() => server.joinMatch({} as any, owner, socket, "0" as any))
      await expectForbiddenAsync(() =>
        server.setMatchOptions({
          socket,
          matchSessionId: "match-123",
          userSession: owner,
          options: { __protoPollution: true } as any,
        })
      )
      await expectForbiddenAsync(() =>
        server.setMatchPlayerReady({
          matchSessionId: "match-123",
          userSession: owner,
          ready: 1 as any,
        })
      )
      await expectForbiddenAsync(() =>
        server.pauseMatch({
          matchSessionId: "match-123",
          userSession: owner,
          pause: "true" as any,
        })
      )
      await expectForbiddenAsync(() =>
        server.startMatch({
          identityJwt: null,
          matchSessionId: "a".repeat(MAX_CLIENT_IDENTIFIER_LENGTH + 1),
          userSession: owner,
        })
      )
      await expectForbiddenAsync(() =>
        server.kickPlayer({
          key: "a".repeat(MAX_CLIENT_IDENTIFIER_LENGTH + 1),
          matchSessionId: "match-123",
          userSession: owner,
        })
      )
      expect(server.emitSocketMatch(socket, "")).to.equal(null)
      await expectForbiddenAsync(() => server.leaveMatch(" match-123", socket))
      await expectForbiddenAsync(() => server.getMatchDetails(socket, 0))
      await expectForbiddenAsync(() => server.getAccountDetails(socket, -1))

      expect(server.tables.size).to.equal(0)
      expect(server.matchQueue.size).to.equal(0)
      expect(server.getOpsStatus().counts.inFlightAdmissions).to.equal(0)
    } finally {
      await server.close()
    }
  })

  it("does not leak createdFromQueue into public lobby options", async () => {
    const server = Trucoshi({ port: 0, serverVersion: "queue-metadata-test" })
    const socket = createSocket("queue-owner")
    const owner = server.createUserSession(socket, "queue-owner", "queue-owner")
    server.chat = Chat(server.io, server.tables)

    try {
      const table = await server.createMatchTable(owner, socket, {
        createdFromQueue: true,
        maxPlayers: 2,
      })

      expect(table.createdFromQueue).to.equal(true)
      expect(table.lobby.options).to.deep.equal({
        faltaEnvido: 1,
        flor: true,
        matchPoint: 9,
        maxPlayers: 2,
        handAckTime: table.lobby.options.handAckTime,
        turnTime: table.lobby.options.turnTime,
        abandonTime: table.lobby.options.abandonTime,
        satsPerPlayer: 0,
      })
      expect(table.lobby.options).not.to.have.property("createdFromQueue")
    } finally {
      await server.close()
    }
  })
})
