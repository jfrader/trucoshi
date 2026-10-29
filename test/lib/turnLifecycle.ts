import { expect } from "chai"
import * as sinon from "sinon"
import { TrucoshiTurn } from "../../src/server/classes/Turn"

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
