import { expect } from "chai"
import { Deck, ICard, Random, rng, dealCards, PlayedCard } from "../../src"
import { ITable, Table } from "../../src"
import { IPlayer } from "../../src/types"
import { CARDS } from "../../src/lib/constants"
import { Player } from "../../src/truco"

describe("Trucoshi Deck", () => {
  let deck: ReturnType<typeof Deck>
  let table: ITable<IPlayer>
  let player1: IPlayer, player2: IPlayer, player3: IPlayer, player4: IPlayer

  beforeEach(() => {
    deck = Deck()
    player1 = Player({ key: "p1", name: "Player 1", teamIdx: 0, accountId: 1, avatarUrl: "" })
    player2 = Player({ key: "p2", name: "Player 2", teamIdx: 0, accountId: 2, avatarUrl: "" })
    player3 = Player({ key: "p3", name: "Player 3", teamIdx: 1, accountId: 3, avatarUrl: "" })
    player4 = Player({ key: "p4", name: "Player 4", teamIdx: 1, accountId: 4, avatarUrl: "" })

    player1.setIdx(0)
    player2.setIdx(1)
    player3.setIdx(2)
    player4.setIdx(3)

    table = Table("test-session", [player1, player2, player3, player4])
    table.forehandIdx = 0
  })

  it("should initialize deck with 40 cards", () => {
    expect(deck.cards).to.have.lengthOf(40)
    expect(deck.usedCards).to.be.empty
    expect(deck.random).to.exist
    expect(Object.keys(CARDS)).to.include.members(deck.cards)
  })

  it("should take a single card and update usedCards", () => {
    const initialLength = deck.cards.length
    const card = deck.takeCard()
    expect(card).to.be.a("string")
    expect(deck.cards).to.have.lengthOf(initialLength - 1)
    expect(deck.usedCards).to.have.lengthOf(1)
    expect(deck.usedCards[0]).to.equal(card)
    expect(deck.cards).to.not.include(card)
  })

  it("should take three cards and update usedCards", () => {
    const initialLength = deck.cards.length
    const cards = deck.takeThree()
    expect(cards).to.have.lengthOf(3)
    expect(deck.cards).to.have.lengthOf(initialLength - 3)
    expect(deck.usedCards).to.have.lengthOf(3)
    expect(deck.usedCards).to.include.members(cards)
    cards.forEach((card) => expect(deck.cards).to.not.include(card))
  })

  it("should pick a specific card from the deck", () => {
    const card = "7c"
    const picked = deck.pick(card)
    expect(picked).to.equal(card)
    expect(deck.cards).to.not.include(card)
    expect(deck.usedCards).to.include(card)
    expect(deck.usedCards).to.have.lengthOf(1)
  })

  it("should return null when picking a non-existent card", () => {
    const picked = deck.pick("invalid" as ICard)
    expect(picked).to.be.null
    expect(deck.usedCards).to.be.empty
  })

  it("should shuffle deck and maintain 40 cards", () => {
    deck.shuffle(0)
    expect(deck.cards).to.have.lengthOf(40)
    expect(deck.usedCards).to.be.empty
    expect(Object.keys(CARDS)).to.include.members(deck.cards)
    // Verify order is different
    const originalCards = Object.keys(CARDS)
    expect(deck.cards).to.not.deep.equal(originalCards)
  })

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

    for (const count of counts) {
      expect(count).to.be.greaterThan(195).lessThan(305)
    }

    console.log("Random integer counts:", counts)
    done()
  })

  it("should shuffle deck with proper distributed randomness", (done) => {
    deck.random.bitcoinHash = "test-bitcoin-hash"
    deck.random.clients[0] = rng.generateServerSeed()

    const counts: Record<ICard, number> = {} as any
    for (let i = 0; i < 10000; i++) {
      deck.shuffle(0)
      const card = deck.cards[0]
      counts[card] = (counts[card] || 0) + 1
      deck.random.next()
    }

    for (const count of Object.values(counts)) {
      expect(count).to.be.greaterThan(180).lessThan(320)
    }

    const entries = Object.entries(counts)
    expect(entries.length).to.equal(40)

    console.log("Card distribution counts:", entries)
    done()
  })

  it("should deal three cards to each player", () => {
    dealCards(table, deck)
    for (const player of table.players) {
      expect(player.hand).to.have.lengthOf(3)
      expect(deck.usedCards).to.include.members(player.hand)
      expect(deck.cards).to.not.include.members(player.hand)
    }
    expect(deck.usedCards).to.have.lengthOf(12) // 4 players * 3 cards
    expect(deck.cards).to.have.lengthOf(28) // 40 - 12
  })

  it("should deal specific cards with APP_CHEAT_CARDS", () => {
    process.env.APP_CHEAT_CARDS = JSON.stringify([
      ["7c", "6c", "5c"], // player1
      ["4e", "3e", "2e"], // player2
      ["5o", "1o", "6e"], // player3
      ["7b", "1b", "5b"], // player4
    ])

    dealCards(table, deck)

    expect(player1.hand).to.deep.equal(["7c", "6c", "5c"])
    expect(player2.hand).to.deep.equal(["4e", "3e", "2e"])
    expect(player3.hand).to.deep.equal(["5o", "1o", "6e"])
    expect(player4.hand).to.deep.equal(["7b", "1b", "5b"])
    expect(deck.usedCards).to.have.lengthOf(12)
    expect(deck.cards).to.have.lengthOf(28)
    expect(deck.usedCards).to.include.members([
      "7c",
      "6c",
      "5c",
      "4e",
      "3e",
      "2e",
      "5o",
      "1o",
      "6e",
      "7b",
      "1b",
      "5b",
    ])

    delete process.env.APP_CHEAT_CARDS
  })

  it("should throw invalid APP_CHEAT_CARDS", () => {
    process.env.APP_CHEAT_CARDS = "invalid-json"

    expect(() => dealCards(table, deck)).to.throw()

    delete process.env.APP_CHEAT_CARDS
  })

  it("should handle cheat_lots_of_flowers", () => {
    process.env.APP_CHEAT_LOTS_OF_FLOWERS_FOR_TESTING = "1"

    dealCards(table, deck)

    for (const player of table.players) {
      expect(player.hand).to.have.lengthOf(3)
      expect(deck.usedCards).to.include.members(player.hand)
      expect(deck.cards).to.not.include.members(player.hand)
      // Check if at least one player has a flor (same suit)
      const suits = player.hand.map((card) => card.charAt(1))
      if (suits.every((suit) => suit === suits[0])) {
        expect(player.hasFlor).to.be.true
      }
    }
    expect(deck.usedCards).to.have.lengthOf(12)
    expect(deck.cards).to.have.lengthOf(28)

    delete process.env.APP_CHEAT_LOTS_OF_FLOWERS_FOR_TESTING
  })

  it("should throw error when taking card from empty deck", () => {
    deck.cards = []
    expect(() => deck.takeCard()).to.throw("No cards left in deck")
  })

  it("should create PlayedCard with correct properties", () => {
    const card = "7c"
    const playedCard = PlayedCard(player1, card)
    expect(playedCard).to.have.property("player").deep.equal(player1)
    expect(playedCard).to.have.property("card").equal(card)
    expect(playedCard)
      .to.have.property("key")
      .equal(card + player1.idx)
  })

  it("should create burnt PlayedCard", () => {
    const playedCard = PlayedCard(player1, "7c", true)
    expect(playedCard).to.have.property("player").deep.equal(player1)
    expect(playedCard).to.have.property("card").equal("xx")
    expect(playedCard)
      .to.have.property("key")
      .to.be.a("string")
      .not.equal("7c" + player1.idx)
  })
})
