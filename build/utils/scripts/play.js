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
Object.defineProperty(exports, "__esModule", { value: true });
const readline = __importStar(require("readline"));
const lib_1 = require("../../../src/lib");
const types_1 = require("../../../src/types");
const command = (title, onLine) => {
    const promise = () => new Promise((resolve) => {
        const rl = readline.createInterface(process.stdin, process.stdout);
        rl.setPrompt(title);
        rl.prompt();
        rl.on("line", (line) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                yield onLine(line, () => rl.close());
                rl.close();
                resolve();
            }
            catch (e) {
                rl.close();
                return (() => __awaiter(void 0, void 0, void 0, function* () {
                    yield promise();
                    resolve();
                }))();
            }
        }));
    });
    return promise;
};
const playCommand = (play) => {
    var _a, _b, _d;
    return command(`${(_a = play.player) === null || _a === void 0 ? void 0 : _a.id} elije una carta [${(_b = play.player) === null || _b === void 0 ? void 0 : _b.hand.map((_c, i) => i + 1)}]: ${JSON.stringify((_d = play.player) === null || _d === void 0 ? void 0 : _d.hand)}\n`, (idx) => __awaiter(void 0, void 0, void 0, function* () {
        var _e, _f;
        const card = (_e = play.player) === null || _e === void 0 ? void 0 : _e.hand[Number(idx) - 1];
        const playedCard = play.use(Number(idx) - 1, card);
        if (!playedCard) {
            return Promise.reject();
        }
        const handString = JSON.stringify((_f = play.player) === null || _f === void 0 ? void 0 : _f.hand);
        console.log(`\n${handString}\nUsing ${playedCard}`);
        console.log(play.rounds && play.rounds.length
            ? play.rounds.map((round) => round.cards.length ? round.cards.map((c) => [c.player.id, c.card]) : "")
            : "");
        return Promise.resolve();
    }));
};
const sayCommand = (play, canPlay) => {
    var _a, _b, _d, _e;
    if (!((_a = play.player) === null || _a === void 0 ? void 0 : _a._commands)) {
        return () => { };
    }
    const commandsArr = Array.from((_d = (_b = play.player) === null || _b === void 0 ? void 0 : _b._commands) === null || _d === void 0 ? void 0 : _d.values());
    return command(`${play.state} ${(_e = play.player) === null || _e === void 0 ? void 0 : _e.id} elije una accion [${canPlay ? "0," : ""}${commandsArr.map((_c, i) => i + 1)}]: ${canPlay ? JSON.stringify(["CARTA", ...(commandsArr || [])]) : JSON.stringify(commandsArr)}\n`, (idx, close) => __awaiter(void 0, void 0, void 0, function* () {
        const selectedCommand = commandsArr[Number(idx) - 1];
        if (selectedCommand) {
            close();
            const saidCommand = play.say(selectedCommand, play.player);
            console.log({ saidCommand });
            return Promise.resolve();
        }
        if (idx === "0" && canPlay) {
            close();
            yield playCommand(play)();
            return Promise.resolve();
        }
        return Promise.reject();
    }));
};
const sayPoints = (play) => {
    var _a, _b;
    return command("Canta los puntos " +
        ((_a = play.player) === null || _a === void 0 ? void 0 : _a.id) +
        ", puede cantar: " +
        ((_b = play.player) === null || _b === void 0 ? void 0 : _b.envido.map((e) => e + ", ")), (line, close) => __awaiter(void 0, void 0, void 0, function* () {
        var _d;
        if (line && ((_d = play.player) === null || _d === void 0 ? void 0 : _d.envido.includes(Number(line)))) {
            close();
            if (play.say(Number(line), play.player)) {
                return Promise.resolve();
            }
        }
        return Promise.reject();
    }));
};
(() => __awaiter(void 0, void 0, void 0, function* () {
    const trucoshi = (0, lib_1.Lobby)();
    const promises = [
        trucoshi.addPlayer("lukini", "lukini", "lukini").then((player) => player.setReady(true)),
        trucoshi.addPlayer("denoph", "denoph", "denoph").then((player) => player.setReady(true)),
        trucoshi.addPlayer("guada", "guada", "guada").then((player) => player.setReady(true)),
        trucoshi.addPlayer("juli", "juli", "juli").then((player) => player.setReady(true)),
    ];
    yield Promise.allSettled(promises);
    trucoshi
        .startMatch()
        .onEnvido((play, isPointsRound) => __awaiter(void 0, void 0, void 0, function* () {
        if (isPointsRound) {
            return sayPoints(play)();
        }
        yield sayCommand(play, false)();
    }))
        .onTruco((play) => __awaiter(void 0, void 0, void 0, function* () {
        yield sayCommand(play, false)();
    }))
        .onTurn((play) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const name = (_a = play.player) === null || _a === void 0 ? void 0 : _a.id.toUpperCase();
        console.log(`=== Mano ${play.handIdx} === Ronda ${play.roundIdx} === Turno de ${name} ===`);
        play.teams.map((team, id) => console.log(`=== Team ${id} = ${team.points.malas} malas ${team.points.buenas} buenas`));
        console.log(play.rounds && play.rounds.length
            ? play.rounds.map((round) => round.cards.length ? round.cards.map((c) => [c.player.id, types_1.CARDS_HUMAN_READABLE[c.card] || 'xx']) : "")
            : "");
        yield sayCommand(play, true)();
    }))
        .onWinner((winner, teams) => __awaiter(void 0, void 0, void 0, function* () {
        teams.map((t, i) => console.log(`Equipo ${i}: ${t.players.map((p) => ` ${p.id}`)} === ${t.points.malas} malas ${t.points.buenas} buenas`));
        console.log(`\nEquipo Ganador:${winner === null || winner === void 0 ? void 0 : winner.players.map((p) => ` ${p.id}`)}`);
    }))
        .begin();
}))();
