"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Round = void 0;
const utils_1 = require("../utils");
const Deck_1 = require("./Deck");
function Round() {
    const round = {
        turn: 0,
        highest: -1,
        winner: null,
        cards: [],
        tie: false,
        nextTurn() {
            round.turn++;
        },
        use({ card, player }) {
            var _a;
            const value = (0, utils_1.getCardValue)(card);
            if (value === round.highest && player.teamIdx !== ((_a = round.winner) === null || _a === void 0 ? void 0 : _a.teamIdx)) {
                round.tie = true;
            }
            if (value > round.highest) {
                round.tie = false;
                round.highest = value;
                round.winner = player;
            }
            round.cards.push((0, Deck_1.PlayedCard)(player, card));
            return card;
        },
    };
    return round;
}
exports.Round = Round;
