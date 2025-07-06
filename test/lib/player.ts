import { expect } from "chai"
import { Player } from "../../src/truco"

describe("Trucoshi Player", () => {
  it("should calculate flor points properly", (done) => {
    const player1 = Player({
      accountId: 1,
      avatarUrl: "",
      key: "p1",
      name: "p1",
      teamIdx: 0,
    })

    player1.setHand(["pb", "1b", "cb"])
    player1.calculateEnvido()
    expect(player1.flor?.value).eq(21)

    player1.setHand(["pe", "ce", "re"])
    player1.calculateEnvido()
    expect(player1.flor?.value).eq(20)

    player1.setHand(["5o", "1o", "6o"])
    player1.calculateEnvido()
    expect(player1.flor?.value).eq(32)

    player1.setHand(["7c", "6c", "5c"])
    player1.calculateEnvido()
    expect(player1.flor?.value).eq(38)

    done()
  })
})
