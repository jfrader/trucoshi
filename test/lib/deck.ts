import { Random, rng } from "../../src"

describe("Trucoshi Deck", () => {
  it("should show card randomness distribution", (done) => {
    const random = Random()
    random.clients[0] = "test-client-seed" // Simulate player seed
    random.secret = rng.generateServerSeed()
    random.bitcoinHash = "test-bitcoin-hash" // Simulate Bitcoin hash
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
    console.log("Index distribution:", counts)

    done()
  })
})
