"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayedCard = exports.Deck = void 0;
const crypto_1 = require("crypto");
const constants_1 = require("../constants");
const utils_1 = require("../utils");
function Deck() {
    const deck = {
        cards: Object.keys(constants_1.CARDS),
        usedCards: [],
        takeCard() {
            const card = deck.cards.shift();
            deck.usedCards.push(card);
            return card;
        },
        takeThree() {
            return [deck.takeCard(), deck.takeCard(), deck.takeCard()];
        },
        shuffle() {
            deck.cards = deck.cards.concat(deck.usedCards);
            deck.usedCards = [];
            deck.cards = (0, utils_1.shuffleArray)(deck.cards);
            if (deck.cards.length !== 40) {
                throw new Error("This is not good");
            }
            return deck;
        },
    };
    return deck.shuffle().shuffle();
}
exports.Deck = Deck;
function PlayedCard(player, card, burn) {
    const pc = {
        player,
        card,
        key: card + player.key,
    };
    if (burn) {
        pc.card = constants_1.BURNT_CARD;
        pc.key = (0, crypto_1.randomUUID)().substring(0, 12);
    }
    return pc;
}
exports.PlayedCard = PlayedCard;
