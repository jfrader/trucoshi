"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Match = void 0;
const logger_1 = __importDefault(require("../../utils/logger"));
const Deck_1 = require("./Deck");
const Hand_1 = require("./Hand");
const playerAbandoned = (player) => player.abandoned;
function* matchTurnGeneratorSequence(match) {
    while (!match.winner) {
        if (match.teams[0].players.every(playerAbandoned)) {
            match.setWinner(match.teams[1]);
            break;
        }
        if (match.teams[1].players.every(playerAbandoned)) {
            match.setWinner(match.teams[0]);
            break;
        }
        match.deck.shuffle();
        match.setCurrentHand(null);
        yield match;
        const hand = match.setCurrentHand((0, Hand_1.Hand)(match, match.hands.length + 1));
        match.pushHand(hand);
        while (!hand.finished()) {
            const { value } = hand.getNextTurn();
            if (value) {
                if (value.currentPlayer &&
                    (value.currentPlayer.disabled || value.currentPlayer.abandoned)) {
                    value.nextTurn();
                    continue;
                }
                if (value.finished()) {
                    break;
                }
            }
            match.setCurrentHand(value);
            yield match;
        }
        match.setPrevHand(hand);
        match.setCurrentHand(null);
        const teams = match.addPoints(hand.points);
        const winner = teams.find((team) => team.points.winner);
        if (winner) {
            match.setWinner(winner);
            match.setCurrentHand(null);
            break;
        }
        match.table.nextHand();
    }
    yield match;
}
function Match(table, teams = [], options) {
    const size = teams[0].players.length;
    if (size !== teams[1].players.length) {
        throw new Error("Team size mismatch");
    }
    const match = {
        winner: null,
        deck: (0, Deck_1.Deck)(),
        options: structuredClone(options),
        teams: teams,
        hands: [],
        table,
        prevHand: null,
        currentHand: null,
        play() {
            logger_1.default.trace({ players: table.players.map((p) => p.getPublicPlayer()) }, "Attempting to get match next turn");
            match.getNextTurn();
            if (!match.currentHand) {
                return null;
            }
            return match.currentHand.play(match.prevHand);
        },
        addPoints(points) {
            match.teams[0].addPoints(match.options.matchPoint, points[0]);
            match.teams[1].addPoints(match.options.matchPoint, points[1]);
            return match.teams;
        },
        pushHand(hand) {
            match.hands.push(hand);
        },
        setCurrentHand(hand) {
            match.currentHand = hand;
            return match.currentHand;
        },
        setPrevHand(hand) {
            match.prevHand = hand;
            return match.prevHand;
        },
        setWinner(winner) {
            match.winner = winner;
        },
        getNextTurn() {
            return turnGenerator.next();
        },
    };
    const turnGenerator = matchTurnGeneratorSequence(match);
    return match;
}
exports.Match = Match;
