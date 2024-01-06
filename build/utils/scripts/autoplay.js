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
Object.defineProperty(exports, "__esModule", { value: true });
const lib_1 = require("../../lib");
(() => __awaiter(void 0, void 0, void 0, function* () {
    const trucoshi = (0, lib_1.Lobby)();
    const promises = [
        trucoshi.addPlayer("lukini", "lukini", "lukini").then((player) => player.setReady(true)),
        trucoshi.addPlayer("denoph", "denoph", "denoph").then((player) => player.setReady(true)),
        trucoshi.addPlayer("guada", "guada", "guada").then((player) => player.setReady(true)),
        trucoshi.addPlayer("juli", "juli", "juli").then((player) => player.setReady(true)),
        trucoshi.addPlayer("day", "day", "day").then((player) => player.setReady(true)),
        trucoshi.addPlayer("fran", "fran", "fran").then((player) => player.setReady(true)),
    ];
    yield Promise.allSettled(promises);
    trucoshi
        .startMatch()
        .onTurn((play) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        if (!play.player) {
            return;
        }
        const name = (_a = play.player) === null || _a === void 0 ? void 0 : _a.id.toUpperCase();
        console.log(`=== Mano ${play.handIdx} === Ronda ${play.roundIdx} === Turno de ${name} ===`);
        play.teams.map((team, id) => console.log(`=== Team ${id} = ${team.points.malas} malas ${team.points.buenas} buenas ===`));
        console.log(play.rounds && play.rounds.length
            ? play.rounds.map((round) => round.cards.length ? round.cards.map((c) => [c.player.id, c.card]) : "")
            : "");
        const randomIdx = Math.round(Math.random() * (play.player.hand.length - 1));
        const handString = JSON.stringify(play.player.hand);
        const card = play.use(randomIdx, play.player.hand[randomIdx]);
        console.log(`\n${handString}\nUsing ${card}`);
        console.log(play.rounds && play.rounds.length
            ? play.rounds.map((round) => round.cards.length
                ? round.cards.map((c) => [c.player.id, lib_1.CARDS_HUMAN_READABLE[c.card] || "xx"])
                : "")
            : "");
    }))
        .onWinner((winner, teams) => __awaiter(void 0, void 0, void 0, function* () {
        console.log("\n");
        teams.map((t, i) => console.log(`Equipo ${i}: ${t.players.map((p) => ` ${p.id}`)} === ${t.points.malas} malas ${t.points.buenas} buenas`));
        console.log(`\nEquipo Ganador:${winner.players.map((p) => ` ${p.id}`)}`);
    }))
        .begin();
}))();
