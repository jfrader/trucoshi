import { ICard, IDeck, IPlayedCard, IPlayer, IPublicPlayer } from "../../types"
import { BURNT_CARD, CARDS } from "../constants"
import { Random } from "./Random"
import { ITable } from "./Table"

export function Deck(): IDeck {
  const deck: IDeck = {
    cards: getAllCards(),
    random: Random(),
    usedCards: [],
    takeCard() {
      const card = deck.cards.shift() as ICard
      deck.usedCards.push(card)
      return card
    },
    takeThree() {
      return [deck.takeCard(), deck.takeCard(), deck.takeCard()]
    },
    pick(card) {
      const idx = deck.cards.findIndex((c) => c === card)
      if (idx > -1) {
        deck.cards.splice(idx, 1)
        deck.usedCards.push(card)
        return card
      }
      return null
    },
    shuffle(dealer) {
      deck.cards = getAllCards()
      deck.usedCards = []
      deck.cards = shuffleArray(deck.cards, (max) => deck.random.pick(dealer, max))
      if (deck.cards.length !== 40) {
        throw new Error("This is not good")
      }
      return deck
    },
  }

  return deck
}

export const getAllCards = () => Object.keys(CARDS) as Array<ICard>

export function dealCards<
  TPlayer extends { key: string; idx: number; setHand(h: Array<ICard>): void } = IPlayer
>(table: ITable<TPlayer>, deck: IDeck) {
  const cheat_lots_of_flowers = process.env.APP_CHEAT_LOTS_OF_FLOWERS_FOR_TESTING === "1"
  const cheat_cards = process.env.APP_CHEAT_CARDS || ""
  const playerHands: ICard[][] = []
  const players = table.getPlayersForehandFirst()

  for (let i = 0; i < 3; i++) {
    for (const player of players) {
      playerHands[player.idx] = [...(playerHands[player.idx] || []), deck.takeCard()] as ICard[]
    }
  }

  if (cheat_cards) {
    try {
      const new_cards = JSON.parse(cheat_cards) as Array<[ICard, ICard, ICard]>

      deck.shuffle(players[0].idx)
      for (const [key, player] of players.entries()) {
        playerHands[player.idx] = new_cards[key]
          ? new_cards[key].map((c) => deck.pick(c) || deck.takeCard())
          : deck.takeThree()
      }
    } catch {
      //noop
    }
  }

  if (cheat_lots_of_flowers) {
    deck.shuffle(players[0].idx)
    for (const player of players) {
      if (Math.random() > 0.5) {
        const first = deck.takeCard()
        const second = deck.pick(deck.cards.find((c) => c.charAt(1) === first.charAt(1))!)!
        const third = deck.pick(deck.cards.find((c) => c.charAt(1) === first.charAt(1))!)!
        playerHands[player.idx] = [first, second, third]
        continue
      }

      playerHands[player.idx] = deck.takeThree()
    }
  }

  for (const [key, player] of table.players.entries()) {
    player.setHand(playerHands[key])
  }
}

const defaultGetRandom = (max: number) => Math.floor(Math.random() * max)

export function shuffleArray<T = unknown>(
  array: Array<T>,
  getRandom: (max: number) => number = defaultGetRandom
) {
  let currentIndex = array.length,
    randomIndex

  while (currentIndex != 0) {
    randomIndex = getRandom(currentIndex)
    currentIndex--
    ;[array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]]
  }

  return array as Array<T>
}

export function PlayedCard(
  player: IPlayer | IPublicPlayer,
  card: ICard,
  burn?: boolean
): IPlayedCard {
  const pc: IPlayedCard = {
    player,
    card,
    key: card + player.idx,
  }

  if (burn) {
    pc.card = BURNT_CARD
    pc.key = Math.floor(Math.random() * 100).toString()
  }

  return pc
}
