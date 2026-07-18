import { expect } from "chai"
import { Player } from "../../src/truco"
import { EFlorCommand } from "../../src/types"

describe("Trucoshi Player", () => {
  let player: ReturnType<typeof Player>

  beforeEach(() => {
    player = Player({
      accountId: 1,
      avatarUrl: "",
      key: "p1",
      name: "Player 1",
      teamIdx: 0,
    })
  })

  describe("calculateEnvido and setHand", () => {
    it("should calculate Flor (and envido) points correctly for valid Flor hands", () => {
      player.setHand(["pb", "1b", "cb"]) // 10 + 1 + 10 + 20 = 21
      expect(player.calculateEnvido()).to.have.lengthOf(2)
      expect(player.hasFlor).to.be.true
      expect(player.flor).to.deep.equal({ cards: ["pb", "1b", "cb"], value: 21 })
      expect(player.envido).to.have.lengthOf(2)

      player.setHand(["pe", "ce", "re"]) // 10 + 10 + 10 + 20 = 20
      expect(player.calculateEnvido()).to.have.lengthOf(1)

      expect(player.hasFlor).to.be.true
      expect(player.flor).to.deep.equal({ cards: ["pe", "ce", "re"], value: 20 })
      expect(player.envido).to.have.lengthOf(1)

      player.setHand(["5o", "1o", "6o"]) // 5 + 1 + 6 + 20 = 32
      expect(player.calculateEnvido()).to.have.lengthOf(3)
      expect(player.hasFlor).to.be.true
      expect(player.flor).to.deep.equal({ cards: ["5o", "1o", "6o"], value: 32 })
      expect(player.envido).to.have.lengthOf(3)

      player.setHand(["7c", "6c", "5c"]) // 7 + 6 + 5 + 20 = 38
      expect(player.calculateEnvido()).to.have.lengthOf(3)
      expect(player.hasFlor).to.be.true
      expect(player.flor).to.deep.equal({ cards: ["7c", "6c", "5c"], value: 38 })
      expect(player.envido).to.have.lengthOf(3)
    })

    it("should calculate Envido points for non-Flor hands with same suit", () => {
      player.setHand(["7c", "6c", "5o"]) // Envido: 7 + 6 + 20 = 33
      expect(player.calculateEnvido()).to.have.lengthOf(1)
      expect(player.hasFlor).to.be.false
      expect(player.flor).to.be.null
      expect(player.envido).to.deep.equal([{ value: 33, cards: ["7c", "6c"] }])
    })

    it("should calculate Envido points for non-Flor hands with different suits", () => {
      player.setHand(["7c", "6o", "5e"]) // Envido: max(7, 6, 5) = 7
      expect(player.calculateEnvido()).to.have.lengthOf(1)
      expect(player.hasFlor).to.be.false
      expect(player.flor).to.be.null
      expect(player.envido).to.deep.equal([{ value: 7, cards: ["7c"] }])
    })

    it("should handle empty hand", () => {
      player.setHand([])
      expect(player.calculateEnvido()).to.have.lengthOf(1)
      expect(player.hasFlor).to.be.false
      expect(player.flor).to.be.null
      expect(player.envido).to.deep.equal([{ value: 0, cards: [] }])
    })

    it("should reset state when setting new hand", () => {
      player.setHand(["7c", "6c", "5c"])
      player.saidFlor()
      player.useCard(0, "7c")
      expect(player.hasFlor).to.be.false
      expect(player.hasSaidFlor).to.be.true
      expect(player.usedHand).to.deep.equal(["7c"])
      expect(player.didSomething).to.be.true

      player.setHand(["5o", "1o", "6o"])
      expect(player.hasFlor).to.be.true
      expect(player.hasSaidFlor).to.be.false
      expect(player.usedHand).to.be.empty
      expect(player.prevHand).to.deep.equal(["7c"])
      expect(player.didSomething).to.be.false
      expect(player.flor).to.deep.equal({ cards: ["5o", "1o", "6o"], value: 32 })
    })
  })

  describe("useCard", () => {
    it("should play a valid card and update state", () => {
      player.setHand(["7c", "6c", "5c"])
      const playedCard = player.useCard(1, "6c")
      expect(playedCard).to.equal("6c")
      expect(player.hand).to.deep.equal(["7c", "5c"])
      expect(player.usedHand).to.deep.equal(["6c"])
      expect(player.didSomething).to.be.true
    })

    it("should return null for invalid card index", () => {
      player.setHand(["7c", "6c", "5c"])
      const playedCard = player.useCard(3, "6c")
      expect(playedCard).to.be.null
      expect(player.hand).to.deep.equal(["7c", "6c", "5c"])
      expect(player.usedHand).to.be.empty
      expect(player.hasFlor).to.be.true
      expect(player.didSomething).to.be.false
    })

    it("should return null for mismatched card", () => {
      player.setHand(["7c", "6c", "5c"])
      const playedCard = player.useCard(1, "5c")
      expect(playedCard).to.be.null
      expect(player.hand).to.deep.equal(["7c", "6c", "5c"])
      expect(player.usedHand).to.be.empty
      expect(player.hasFlor).to.be.true
      expect(player.didSomething).to.be.false
    })
  })

  describe("sayCommand", () => {
    it("should allow valid Envido points if in envido array", () => {
      player.setHand(["7c", "6c", "5o"]) // Envido: 33
      expect(player.sayCommand(33)).to.equal(33)
      expect(player.didSomething).to.be.true
    })

    it("should reject invalid Envido points", () => {
      player.setHand(["7c", "6c", "5o"]) // Envido: 33
      expect(player.sayCommand(30)).to.be.false
      expect(player.didSomething).to.be.false
    })

    it("should allow valid commands if in commands set", () => {
      player._commands.add(EFlorCommand.FLOR)
      expect(player.sayCommand(EFlorCommand.FLOR)).to.equal(EFlorCommand.FLOR)
      expect(player.didSomething).to.be.true
    })

    it("should reject commands not in commands set without force", () => {
      expect(player.sayCommand(EFlorCommand.FLOR)).to.be.false
      expect(player.didSomething).to.be.false
    })

    it("should allow commands with force flag", () => {
      expect(player.sayCommand(EFlorCommand.FLOR, true)).to.equal(EFlorCommand.FLOR)
      expect(player.didSomething).to.be.true
    })
  })

  describe("saidFlor", () => {
    it("should mark player as having said Flor", () => {
      player.setHand(["7c", "6c", "5c"])
      expect(player.hasSaidFlor).to.be.false
      player.saidFlor()
      expect(player.hasSaidFlor).to.be.true
    })
  })

  describe("getPublicPlayer", () => {
    it("should expose private props for own session", () => {
      player.setSession("session1")
      player.setHand(["7c", "6c", "5c"])
      player._commands.add(EFlorCommand.FLOR)
      const publicPlayer = player.getPublicPlayer("session1")
      expect(publicPlayer.isMe).to.be.true
      expect(publicPlayer.commands).to.deep.equal([EFlorCommand.FLOR])
      expect(publicPlayer.hasFlor).to.be.true
      expect(publicPlayer.envido).to.deep.equal([
        { value: 33, cards: ["7c", "6c"] },
        { value: 32, cards: ["7c", "5c"] },
        { value: 31, cards: ["6c", "5c"] },
      ])
      expect(publicPlayer.hand).to.deep.equal(["7c", "6c", "5c"])
    })

    it("should hide private props for other sessions", () => {
      player.setSession("session1")
      player.setHand(["7c", "6c", "5c"])
      player._commands.add(EFlorCommand.FLOR)
      const publicPlayer = player.getPublicPlayer("session2")
      expect(publicPlayer.isMe).to.be.false
      expect(publicPlayer.commands).to.be.undefined
      expect(publicPlayer.hasFlor).to.be.undefined
      expect(publicPlayer.envido).to.be.undefined
      expect(publicPlayer.hand).to.deep.equal(["xx", "xx", "xx"])
    })
  })

  describe("getHighestCard and getLowestCard", () => {
    it("should return highest and lowest cards based on CARDS value", () => {
      player.setHand(["7c", "1o", "pb"]) // CARDS: 7c=7, 1o=1, pb=10
      const [highestIdx, highestCard] = player.getHighestCard()
      expect(highestIdx).to.equal(1)
      expect(highestCard).to.equal("1o")

      const [lowestIdx, lowestCard] = player.getLowestCard()
      expect(lowestIdx).to.equal(0)
      expect(lowestCard).to.equal("7c")
    })
  })

  describe("getHighestEnvido", () => {
    it("should return highest Envido value", () => {
      player.setHand(["7c", "6c", "5o"]) // Envido: 33
      expect(player.getHighestEnvido()).to.equal(33)
    })

    it("should return 0 for empty envido", () => {
      player.setHand([])
      expect(player.getHighestEnvido()).to.equal(0)
    })
  })
})
