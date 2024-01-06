"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayInstance = void 0;
const logger_1 = __importDefault(require("../../utils/logger"));
const types_1 = require("../../types");
function PlayInstance(hand, prevHand, teams) {
    function play(fn, ...args) {
        if (!fn) {
            return null;
        }
        const result = fn(...args);
        if (result !== null) {
            instance.setWaiting(false);
            return result;
        }
        return null;
    }
    const instance = {
        state: hand.state,
        teams,
        waitingPlay: Boolean(hand.currentPlayer),
        truco: hand.truco,
        envido: hand.envido,
        handIdx: hand.idx,
        roundIdx: hand.rounds.length,
        player: hand.currentPlayer,
        rounds: hand.rounds,
        prevHand: prevHand && !hand.started ? prevHand : null,
        freshHand: !hand.started,
        lastCard: null,
        lastCommand: null,
        setWaiting(waiting) {
            instance.waitingPlay = waiting;
        },
        use(idx, card) {
            const result = play(hand.use, idx, card);
            if (result) {
                instance.lastCard = result;
            }
            return result;
        },
        say(command, player) {
            try {
                if (player.disabled) {
                    return play();
                }
                if (typeof command === "number") {
                    if (command !== 0 && !player.envido.includes(command)) {
                        throw new Error(types_1.GAME_ERROR.INVALID_ENVIDO_POINTS);
                    }
                    const result = play(hand.sayEnvidoPoints, player, command);
                    if (result) {
                        instance.lastCommand = result;
                    }
                    return result;
                }
                if (!player.commands.includes(command)) {
                    throw new Error(types_1.GAME_ERROR.INVALID_COMAND);
                }
                const result = play(hand.say, command, player);
                if (result) {
                    instance.lastCommand = result;
                }
                return result;
            }
            catch (e) {
                logger_1.default.error(e);
                return null;
            }
        },
    };
    return instance;
}
exports.PlayInstance = PlayInstance;
