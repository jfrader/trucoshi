import { ICard, IDeck, IPlayedCard, IPlayer, IPublicPlayer } from "../../types"
import { CARDS } from "../constants"
import { shuffleArray } from "../utils"

export function Deck(): IDeck {
  const deck: IDeck = {
    cards: Object.keys(CARDS) as Array<ICard>,
    usedCards: [],
    takeCard() {
      const card = deck.cards.shift() as ICard
      deck.usedCards.push(card)
      return card
    },
    takeThree() {
      return [deck.takeCard(), deck.takeCard(), deck.takeCard()]
    },
    shuffle() {
      deck.cards = deck.cards.concat(deck.usedCards)
      deck.usedCards = []
      deck.cards = shuffleArray(deck.cards)
      if (deck.cards.length !== 40) {
        throw new Error("This is not good")
      }
      return deck
    },
  }
  return deck
}

export function PlayedCard(player: IPlayer | IPublicPlayer, card: ICard): IPlayedCard {
  const pc: IPlayedCard = {
    player,
    card,
    get key() {
      return card + player.key
    },
  }
  return pc
}
