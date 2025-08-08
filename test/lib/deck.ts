import { expect } from "chai"
import { Deck, ICard, Random, rng } from "../../src"

describe("Trucoshi Deck", () => {
  it("should generate distributed random integers", (done) => {
    const random = Random()
    random.clients[0] = "test-client-seed"
    random.secret = rng.generateServerSeed()
    random.bitcoinHash = "test-bitcoin-hash"
    random.nonce = 0

    const counts = Array(40).fill(0)
    for (let i = 0; i < 10000; i++) {
      const index = rng.generateInteger(
        random.clients[0],
        random.secret,
        random.bitcoinHash,
        random.nonce,
        0,
        39
      )
      counts[index]++
      random.nonce++
    }

    for (const element of counts) {
      expect(element).greaterThan(195).lessThan(305)
    }

    console.log(counts)

    done()
  })

  it("should shuffle deck with proper distributed randomness", (done) => {
    const deck = Deck()

    deck.random.bitcoinHash = "test-bitcoin-hash"
    deck.random.clients[0] = rng.generateServerSeed()

    const counts: Record<ICard, number> = {} as any
    for (let i = 0; i < 10000; i++) {
      deck.shuffle(0)
      const card = deck.cards[0]
      counts[card] = (counts[card] || 0) + 1
      deck.random.next()
    }

    for (const element of Object.values(counts)) {
      expect(element).greaterThan(180).lessThan(320)
    }

    console.log(Object.entries(counts))

    done()
  })
})
