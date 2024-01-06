"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Truco = void 0;
const types_1 = require("../../types");
const EMPTY_TRUCO = {
    turn: 0,
    teamIdx: null,
    answer: null,
    waitingAnswer: false,
    currentPlayer: null,
    players: [],
};
const TRUCO_STATE_MAP = {
    1: types_1.ETrucoCommand.TRUCO,
    2: types_1.ETrucoCommand.RE_TRUCO,
    3: types_1.ETrucoCommand.VALE_CUATRO,
    4: null,
};
function* trucoTurnGeneratorSequence(truco) {
    let i = 0;
    while (i < truco.players.length && truco.answer === null) {
        const player = truco.players[truco.turn];
        truco.setCurrentPlayer(player);
        if (player.disabled) {
            truco.setCurrentPlayer(null);
        }
        if (truco.turn >= truco.players.length - 1) {
            truco.setTurn(0);
        }
        else {
            truco.setTurn(truco.turn + 1);
        }
        i++;
        yield truco;
    }
    yield truco;
}
function Truco(teams) {
    const truco = Object.assign(Object.assign({}, EMPTY_TRUCO), { state: 1, teams, currentCommands: [], getNextTrucoCommand() {
            return TRUCO_STATE_MAP[truco.state];
        },
        reset() {
            Object.assign(truco, EMPTY_TRUCO);
        },
        sayTruco(player) {
            if (truco.state === 4) {
                return truco;
            }
            truco.turn = 0;
            const playerTeamIdx = player.teamIdx;
            const teamIdx = truco.teamIdx;
            if (teamIdx === null || teamIdx !== playerTeamIdx) {
                truco.waitingAnswer = true;
                truco.state++;
                const opponentIdx = Number(!playerTeamIdx);
                truco.teamIdx = playerTeamIdx;
                truco.answer = null;
                truco.players = teams[opponentIdx].players;
                turnGenerator = trucoTurnGeneratorSequence(truco);
                return truco;
            }
            return truco;
        },
        sayAnswer(player, answer) {
            if (player.teamIdx === truco.teamIdx) {
                return truco;
            }
            if (answer !== null) {
                truco.currentCommands = [];
                if (answer === false) {
                    truco.state--;
                    const playerTeam = teams[player.teamIdx];
                    playerTeam.players.forEach((player) => playerTeam.disable(player));
                }
                truco.waitingAnswer = false;
                truco.answer = answer;
            }
            return truco;
        },
        setTeam(idx) {
            truco.teamIdx = idx;
            return truco.teamIdx;
        },
        setTurn(turn) {
            truco.turn = turn;
            return truco.turn;
        },
        setCurrentPlayer(player) {
            truco.currentPlayer = player;
            return truco.currentPlayer;
        },
        getNextPlayer() {
            return turnGenerator.next();
        } });
    let turnGenerator = trucoTurnGeneratorSequence(truco);
    return truco;
}
exports.Truco = Truco;
