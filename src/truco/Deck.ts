import { ICard, IDeck, IPlayedCard, IPlayer, IPublicPlayer } from "../types"
import { BURNT_CARD, CARDS } from "../lib/constants"
import { Random } from "../lib/classes/Random"
import { ITable } from "../lib/classes/Table"

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
    shuffle(dealer) {
      deck.cards = getAllCards()
      deck.usedCards = []
      deck.cards = shuffleArray(deck.cards, (max) => deck.random.pick(dealer, max - 1))
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
  const playerHands: any[] = []

  for (let i = 0; i < 3; i++) {
    for (const player of table.getPlayersForehandFirst()) {
      playerHands[player.idx] = [...(playerHands[player.idx] || []), deck.takeCard()]
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
