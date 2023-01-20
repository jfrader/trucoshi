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
var constants_1 = require("../lib/constants");
var trucoshi_1 = require("../lib/trucoshi");
(function () { return __awaiter(void 0, void 0, void 0, function () {
    var player1, player2, player3, player4, player5, player6, team1, team2, match, play, name, randomIdx, card;
    var _a;
    return __generator(this, function (_b) {
        player1 = (0, trucoshi_1.Player)('lukini', 0);
        player2 = (0, trucoshi_1.Player)('guada', 0);
        player3 = (0, trucoshi_1.Player)('denoph', 1);
        player4 = (0, trucoshi_1.Player)('juli', 1);
        player5 = (0, trucoshi_1.Player)('fran', 1);
        player6 = (0, trucoshi_1.Player)('day', 0);
        team1 = (0, trucoshi_1.Team)(constants_1.COLORS[0], [player1, player2, player6]);
        team2 = (0, trucoshi_1.Team)(constants_1.COLORS[1], [player3, player4, player5]);
        match = (0, trucoshi_1.Match)([team1, team2], 9);
        while (!match.winner) {
            play = match.play();
            if (!play || !play.player) {
                break;
            }
            name = play.player.id.toUpperCase();
            console.log("=== Mano ".concat(play.handIdx, " === Ronda ").concat(play.roundIdx, " === Turno de ").concat(name, " ==="));
            match.teams.map(function (team, id) { return console.log("=== Team ".concat(id, " = ").concat(team.points, " Puntos ===")); });
            console.log(play.rounds && play.rounds.length ? (play.rounds.map(function (round) { return round.cards.length ? round.cards.map(function (c) { return [c.player.id, c.card]; }) : ''; })) : '');
            randomIdx = Math.round(Math.random() * (play.player.hand.length - 1));
            card = play.use(randomIdx);
            console.log("\n".concat(JSON.stringify(play.player.hand), "\nUsing ").concat(card));
            console.log(play.rounds && play.rounds.length ? (play.rounds.map(function (round) { return round.cards.length ? round.cards.map(function (c) { return [c.player.id, c.card]; }) : ''; })) : '');
        }
        console.log('\n');
        match.teams.map(function (t, i) { return console.log("Equipo ".concat(i, ": ").concat(t.players.map(function (p) { return " ".concat(p.id); }), " === ").concat(t.points, " puntos")); });
        console.log("\nEquipo Ganador:".concat((_a = match.winner) === null || _a === void 0 ? void 0 : _a.players.map(function (p) { return " ".concat(p.id); })));
        return [2 /*return*/];
    });
}); })();
