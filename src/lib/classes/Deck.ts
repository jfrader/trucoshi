import { randomUUID } from "crypto"
import { ICard, IDeck, IPlayedCard, IPlayer, IPublicPlayer } from "../../types"
import { BURNT_CARD, CARDS } from "../constants"
import { shuffleArray } from "../utils"
import { Random } from "./Random"

const getAllCards = () => Object.keys(CARDS) as Array<ICard>

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

export function PlayedCard(
  player: IPlayer | IPublicPlayer,
  card: ICard,
  burn?: boolean
): IPlayedCard {
  const pc: IPlayedCard = {
    player,
    card,
    key: card + player.key,
  }

  if (burn) {
    pc.card = BURNT_CARD
    pc.key = randomUUID().substring(0, 8)
  }

  return pc
}
