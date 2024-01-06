"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkHandWinner = exports.shuffleArray = exports.getCardValue = exports.getMaxNumberIndex = void 0;
const constants_1 = require("./constants");
function getMaxNumberIndex(array) {
    return array.reduce((accumulator, current, index) => {
        return current > array[accumulator] ? index : accumulator;
    }, 0);
}
exports.getMaxNumberIndex = getMaxNumberIndex;
function getCardValue(card) {
    return constants_1.CARDS[card] !== undefined ? constants_1.CARDS[card] : -2;
}
exports.getCardValue = getCardValue;
function shuffleArray(array) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex != 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}
exports.shuffleArray = shuffleArray;
function checkHandWinner(rounds, forehandTeamIdx) {
    var _a, _b, _c;
    const roundsWon = {
        0: 0,
        1: 0,
        ties: 0,
    };
    for (let i = 0; i < rounds.length; i++) {
        const round = rounds[i];
        if (round.tie) {
            roundsWon[0] += 1;
            roundsWon[1] += 1;
            roundsWon.ties = roundsWon.ties + 1;
            continue;
        }
        if (((_a = round.winner) === null || _a === void 0 ? void 0 : _a.teamIdx) === 0) {
            roundsWon[0] += 1;
        }
        if (((_b = round.winner) === null || _b === void 0 ? void 0 : _b.teamIdx) === 1) {
            roundsWon[1] += 1;
        }
    }
    if (roundsWon[0] > 2 && roundsWon[1] > 2) {
        return forehandTeamIdx;
    }
    if (rounds.length > 2 && roundsWon.ties > 0 && ((_c = rounds[0]) === null || _c === void 0 ? void 0 : _c.winner)) {
        return rounds[0].winner.teamIdx;
    }
    if (roundsWon[0] >= 2 && roundsWon[1] < 2) {
        return 0;
    }
    if (roundsWon[1] >= 2 && roundsWon[0] < 2) {
        return 1;
    }
    return null;
}
exports.checkHandWinner = checkHandWinner;
