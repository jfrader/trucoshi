"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var readline = __importStar(require("readline"));
var constants_1 = require("../lib/constants");
var trucoshi_1 = require("../lib/trucoshi");
(function () { return __awaiter(void 0, void 0, void 0, function () {
    var player1, player2, player3, player4, team1, team2, match, _loop_1;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                player1 = (0, trucoshi_1.Player)('lukini', 0);
                player2 = (0, trucoshi_1.Player)('guada', 0);
                player3 = (0, trucoshi_1.Player)('denoph', 1);
                player4 = (0, trucoshi_1.Player)('juli', 1);
                team1 = (0, trucoshi_1.Team)(constants_1.COLORS[0], [player1, player2]);
                team2 = (0, trucoshi_1.Team)(constants_1.COLORS[1], [player3, player4]);
                match = (0, trucoshi_1.Match)([team1, team2], 9);
                _loop_1 = function () {
                    var value, prom_1;
                    return __generator(this, function (_c) {
                        switch (_c.label) {
                            case 0:
                                if ((_a = match.currentHand) === null || _a === void 0 ? void 0 : _a.finished) {
                                    console.log(match.currentHand && match.currentHand.rounds.length ? (match.currentHand.rounds.map(function (round) { return round.cards.length ? round.cards.map(function (c) { return [c.player.id, c.card]; }) : ''; })) : '');
                                }
                                value = match.getNextTurn().value;
                                if (!(value && value.currentHand && value.currentHand.currentPlayer)) return [3 /*break*/, 2];
                                prom_1 = function () { return new Promise(function (resolve) {
                                    var _a, _b, _c, _d;
                                    // process.stdout.write('\u001B[2J\u001B[0;0f');
                                    var rl = readline.createInterface(process.stdin, process.stdout);
                                    var currentHand = value.currentHand;
                                    var name = (_b = (_a = value.currentHand) === null || _a === void 0 ? void 0 : _a.currentPlayer) === null || _b === void 0 ? void 0 : _b.id.toUpperCase();
                                    console.log("=== Mano ".concat(currentHand.idx + 1, " === Ronda ").concat(currentHand.rounds.length, " === Turno de ").concat(name, " ===\n"));
                                    match.teams.map(function (team, id) { return console.log("=== Team ".concat(id, " = ").concat(team.points, " Puntos ===\n")); });
                                    console.log(currentHand && currentHand.rounds.length ? (currentHand.rounds.map(function (round) { return round.cards.length ? round.cards.map(function (c) { return [c.player.id, c.card]; }) : ''; })) : '');
                                    rl.setPrompt("\n".concat(name, " elije una carta [1, 2, 3]: ").concat(JSON.stringify((_d = (_c = value.currentHand) === null || _c === void 0 ? void 0 : _c.currentPlayer) === null || _d === void 0 ? void 0 : _d.hand), "\n"));
                                    rl.prompt();
                                    rl.on('line', function (idx) {
                                        var _a, _b, _c, _d, _e;
                                        var index = Number(idx) - 1;
                                        var playedCard = null;
                                        if (index >= 0 && index < 3) {
                                            playedCard = (_b = (_a = value.currentHand) === null || _a === void 0 ? void 0 : _a.currentPlayer) === null || _b === void 0 ? void 0 : _b.useCard(index);
                                        }
                                        if (!playedCard) {
                                            rl.close();
                                            return (function () { return __awaiter(void 0, void 0, void 0, function () {
                                                return __generator(this, function (_a) {
                                                    switch (_a.label) {
                                                        case 0: return [4 /*yield*/, prom_1()];
                                                        case 1:
                                                            _a.sent();
                                                            resolve();
                                                            return [2 /*return*/];
                                                    }
                                                });
                                            }); })();
                                        }
                                        (_d = (_c = value.currentHand) === null || _c === void 0 ? void 0 : _c.currentRound) === null || _d === void 0 ? void 0 : _d.play({ player: (_e = value.currentHand) === null || _e === void 0 ? void 0 : _e.currentPlayer, card: playedCard });
                                        console.log(currentHand && currentHand.rounds.length ? (currentHand.rounds.map(function (round) { return round.cards.length ? round.cards.map(function (c) { return [c.player.id, c.card]; }) : ''; })) : '');
                                        rl.close();
                                        resolve();
                                    });
                                }); };
                                return [4 /*yield*/, prom_1()];
                            case 1:
                                _c.sent();
                                _c.label = 2;
                            case 2: return [2 /*return*/];
                        }
                    });
                };
                _b.label = 1;
            case 1:
                if (!!match.winner) return [3 /*break*/, 3];
                return [5 /*yield**/, _loop_1()];
            case 2:
                _b.sent();
                return [3 /*break*/, 1];
            case 3:
                console.log(match.teams.map(function (t) { return [t.points, t.players[0].id]; }));
                return [2 /*return*/];
        }
    });
}); })();
