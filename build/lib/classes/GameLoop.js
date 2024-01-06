"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameLoop = void 0;
const logger_1 = __importDefault(require("../../utils/logger"));
const types_1 = require("../../types");
const GameLoop = (match) => {
    let gameloop = {
        _onEnvido: () => Promise.resolve(),
        _onTruco: () => Promise.resolve(),
        _onTurn: () => Promise.resolve(),
        _onWinner: () => Promise.resolve(),
        _onHandFinished: () => Promise.resolve(),
        teams: [],
        winner: null,
        currentPlayer: null,
        currentHand: null,
        lastCard: null,
        lastCommand: null,
        onHandFinished: (callback) => {
            gameloop._onHandFinished = callback;
            return gameloop;
        },
        onTruco: (callback) => {
            gameloop._onTruco = callback;
            return gameloop;
        },
        onTurn: (callback) => {
            gameloop._onTurn = callback;
            return gameloop;
        },
        onWinner: (callback) => {
            gameloop._onWinner = callback;
            return gameloop;
        },
        onEnvido: (callback) => {
            gameloop._onEnvido = callback;
            return gameloop;
        },
        begin() {
            return __awaiter(this, void 0, void 0, function* () {
                let winner = null;
                gameloop.teams = match.teams;
                while (!match.winner) {
                    const play = match.play();
                    logger_1.default.trace({ winner: match.winner }, "Game tick started");
                    gameloop.currentHand = match.currentHand;
                    if (!play && match.prevHand) {
                        yield gameloop._onHandFinished(match.prevHand);
                        continue;
                    }
                    if (!play || !play.player) {
                        continue;
                    }
                    gameloop.lastCard = play.lastCard;
                    gameloop.lastCommand = play.lastCommand;
                    gameloop.currentPlayer = play.player;
                    try {
                        if (play.state === types_1.EHandState.WAITING_ENVIDO_ANSWER) {
                            play.player.setTurn(true);
                            yield gameloop._onEnvido(play, false);
                            play.player.setTurn(false);
                            continue;
                        }
                        if (play.state === types_1.EHandState.WAITING_ENVIDO_POINTS_ANSWER) {
                            play.player.setTurn(true);
                            play.player.setEnvidoTurn(true);
                            yield gameloop._onEnvido(play, true);
                            play.player.setEnvidoTurn(false);
                            play.player.setTurn(false);
                            continue;
                        }
                        if (play.state === types_1.EHandState.WAITING_FOR_TRUCO_ANSWER) {
                            play.player.setTurn(true);
                            yield gameloop._onTruco(play);
                            play.player.setTurn(false);
                            continue;
                        }
                        if (play.state === types_1.EHandState.WAITING_PLAY) {
                            play.player.setTurn(true);
                            yield gameloop._onTurn(play);
                            play.player.setTurn(false);
                            continue;
                        }
                    }
                    catch (e) {
                        logger_1.default.error(e);
                        logger_1.default.fatal(e, "Match ended because an error was thrown in the game loop!");
                        match.setWinner(match.teams[0]);
                        winner = match.teams[0];
                    }
                    break;
                }
                if (!match.winner) {
                    throw new Error("Something went very wrong in the game loop");
                }
                winner = match.winner;
                gameloop.winner = winner;
                gameloop.currentPlayer = null;
                try {
                    yield gameloop._onWinner(winner, match.teams);
                }
                catch (e) {
                    logger_1.default.error(e, "Gameloop onWinner callback error");
                }
            });
        },
    };
    return gameloop;
};
exports.GameLoop = GameLoop;
