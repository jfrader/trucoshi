import { expect } from "chai"
import * as sinon from "sinon"
import { TrucoshiTurn } from "../../src/server/classes/Turn"
import { Trucoshi } from "../../src/server/classes/Trucoshi"
import { Chat } from "../../src/server/classes/Chat"
import { EHandState } from "../../src/types"
import { PLAYER_TIMEOUT_GRACE } from "../../src/constants"

describe("Turn timer lifecycle", () => {
  afterEach(() => sinon.restore())

  for (const action of ["resolve", "cancel"] as const) {
    it(`clears the owned timeout when the turn ${action}s`, () => {
      const clock = sinon.useFakeTimers()
      const timeoutCallback = sinon.spy()
      const resolve = sinon.spy()
      const cancel = sinon.spy()
      const retry = sinon.spy()
      const turn = new TrucoshiTurn({
        play: {} as never,
        timeout: setTimeout(timeoutCallback, 100),
        createdAt: Date.now(),
        resolve,
        cancel,
        retry,
      })

      turn[action]()
      turn[action]()
      turn[action === "resolve" ? "cancel" : "resolve"]()
      turn.retry()
      clock.tick(101)

      expect(turn.settled).to.equal(true)
      expect(turn.timeout).to.equal(null)
      expect(timeoutCallback.called).to.equal(false)
      expect(retry.called).to.equal(false)
      expect((action === "resolve" ? resolve : cancel).calledOnce).to.equal(true)
      expect((action === "resolve" ? cancel : resolve).called).to.equal(false)
    })
  }
})

describe("Stored turn ownership", () => {
  let server: ReturnType<typeof Trucoshi>
  let clock: sinon.SinonFakeTimers

  beforeEach(() => {
    server = Trucoshi({ port: 0, serverVersion: "turn-ownership-test" })
    server.chat = Chat(server.io, server.tables)
    clock = sinon.useFakeTimers()
  })

  afterEach(async () => {
    clock.reset()
    sinon.restore()
    server.turns.clear()
    server.store = undefined
    await server.close()
  })

  const fixture = () => {
    const player = {
      key: "owner",
      session: "owner",
      turnExpiresAt: Date.now() + 100000,
      turnExtensionExpiresAt: Date.now() + 200000,
      abandonedTime: 0,
      getPublicPlayer: () => ({}),
    }
    const play = {
      player,
      waitingPlay: true,
      handIdx: 1,
      roundIdx: 1,
      state: EHandState.WAITING_PLAY,
      getHand: () => ({ state: EHandState.WAITING_PLAY }),
      use: sinon.stub().returns("1e"),
    }
    const table = {
      matchSessionId: "turn-ownership",
      log: { trace: sinon.spy(), error: sinon.spy(), warn: sinon.spy() },
      lobby: { paused: false, options: { turnTime: 100000, abandonTime: 100000 } },
    }
    server.sessions.set("owner", { session: "owner" } as never)
    server.chat.rooms.set(table.matchSessionId, { card: sinon.spy() } as never)
    sinon.stub(server, "resetSocketsMatchState").resolves()
    return { player, play, table }
  }

  for (const matches of [true, false]) {
    it(`${matches ? "settles" : "does not settle"} the stored turn when a successful card ${matches ? "matches" : "does not match"} its play`, async () => {
      const { player, play, table } = fixture()
      const resolve = sinon.spy()
      const timeout = sinon.spy()
      const owner = new TrucoshiTurn({
        play: (matches ? play : {}) as never,
        resolve,
        cancel: sinon.spy(),
        retry: sinon.spy(),
        createdAt: Date.now(),
        timeout: setTimeout(timeout, 100),
      })
      server.turns.set(table.matchSessionId, owner)
      await server.playCard({
        table: table as never,
        play: play as never,
        player: player as never,
        cardIdx: 0,
        card: "1e",
      })
      clock.tick(101)
      expect(owner.settled).to.equal(matches)
      expect(resolve.calledOnce).to.equal(matches)
      expect(timeout.called).to.equal(!matches)
    })
  }

  it("does not settle a still-waiting card turn when a say notification resolves", async () => {
    const { play, table } = fixture()
    const emit = sinon.stub(server, "emitWaitingForPlay").resolves()
    await server.onTurn(table as never, play as never)
    const owner = server.turns.getOrThrow(table.matchSessionId)
    expect(owner.settled).to.equal(false)
    expect(owner.timeout).not.to.equal(null)
    owner.retry()
    expect(emit.callCount).to.equal(2)
    owner.resolve()
  })

  for (const method of ["onTurn", "onTruco", "onFlor", "onEnvido"] as const) {
    for (const outcome of ["settled", "replaced"] as const) {
      it(`ignores a delayed ${method} emission retry after its owner is ${outcome}`, async () => {
        const { play, table } = fixture()
        const emit = sinon
          .stub(server, method === "onTurn" ? "emitWaitingForPlay" : "emitWaitingPossibleSay")
          .rejects(new Error("emission failed"))
        const start = {
          onTurn: () => server.onTurn(table as never, play as never),
          onTruco: () => server.onTruco(table as never, play as never),
          onFlor: () => server.onFlor(table as never, play as never),
          onEnvido: () => server.onEnvido(table as never, play as never, false),
        }
        void start[method]()
        await Promise.resolve()
        await Promise.resolve()
        const owner = server.turns.getOrThrow(table.matchSessionId)
        if (outcome === "settled") {
          owner.resolve()
        } else {
          server.turns.set(table.matchSessionId, new TrucoshiTurn({
            play: {} as never,
            timeout: null,
            createdAt: Date.now(),
            resolve: sinon.spy(),
            cancel: sinon.spy(),
            retry: sinon.spy(),
          }))
        }
        await clock.tickAsync(PLAYER_TIMEOUT_GRACE + 1)
        expect(emit.calledOnce).to.equal(true)
      })
    }
  }
})
