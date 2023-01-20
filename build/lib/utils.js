"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkMatchWinner = exports.checkHandWinner = exports.shuffleArray = exports.getCardValue = void 0;
var constants_1 = require("./constants");
function getCardValue(card) {
    return constants_1.CARDS[card] || -1;
}
exports.getCardValue = getCardValue;
function shuffleArray(array) {
    var _a;
    var currentIndex = array.length, randomIndex;
    while (currentIndex != 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        _a = [
            array[randomIndex], array[currentIndex]
        ], array[currentIndex] = _a[0], array[randomIndex] = _a[1];
    }
    return array;
}
exports.shuffleArray = shuffleArray;
function checkHandWinner(rounds, forehandTeamIdx) {
    var _a, _b;
    var roundsWon = {
        0: 0,
        1: 0,
        2: 0 // tied rounds
    };
    for (var i = 0; i < rounds.length; i++) {
        var round = rounds[i];
        if (round.tie) {
            roundsWon[0] += 1;
            roundsWon[1] += 1;
            roundsWon[2] = (roundsWon[2] || 0) + 1;
            continue;
        }
        if (((_a = round.winner) === null || _a === void 0 ? void 0 : _a.teamIdx) === 0) {
            roundsWon[0] += 1;
        }
        if (((_b = round.winner) === null || _b === void 0 ? void 0 : _b.teamIdx) === 1) {
            roundsWon[1] += 1;
        }
    }
    var ties = roundsWon[2] || 0;
    if ((roundsWon[0] > 2 && roundsWon[1] > 2) || (rounds.length > 2 && ties > 0)) {
        return forehandTeamIdx;
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
function checkMatchWinner(teams, matchPoint) {
    if (teams[0].points >= matchPoint) {
        return teams[0];
    }
    if (teams[1].points >= matchPoint) {
        return teams[1];
    }
    return null;
}
exports.checkMatchWinner = checkMatchWinner;
