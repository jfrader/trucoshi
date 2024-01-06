"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchTable = void 0;
const client_1 = require("@prisma/client");
const lib_1 = require("../../lib");
function MatchTable(matchSessionId, ownerSession, options = {}) {
    const table = {
        ownerSession,
        matchSessionId,
        lobby: (0, lib_1.Lobby)(options),
        state() {
            var _a;
            table.lobby.calculateReady();
            if ((_a = table.lobby.gameLoop) === null || _a === void 0 ? void 0 : _a.winner) {
                return client_1.EMatchState.FINISHED;
            }
            if (table.lobby.started) {
                return client_1.EMatchState.STARTED;
            }
            if (table.lobby.ready) {
                return client_1.EMatchState.READY;
            }
            return client_1.EMatchState.UNREADY;
        },
        isSessionPlaying(session) {
            const { lobby: { players }, } = table;
            return players.find((player) => player && player.session === session) || null;
        },
        playerDisconnected(player) {
            player.setReady(false);
        },
        playerReconnected(player) {
            if (player.abandoned) {
                return;
            }
            if (table.state() === client_1.EMatchState.STARTED) {
                player.setReady(true);
            }
        },
        playerAbandoned(player) {
            player.abandon();
        },
        getPublicMatchInfo() {
            var _a;
            const { matchSessionId, state, lobby: { players, options }, } = table;
            return {
                ownerId: (_a = players.find((player) => player.isOwner)) === null || _a === void 0 ? void 0 : _a.id,
                matchSessionId,
                options,
                players: players.length,
                state: state(),
            };
        },
        getHandRounds(hand) {
            if (!hand) {
                return [];
            }
            return hand.rounds.map((round) => round.cards) || [];
        },
        getPreviousHand(hand) {
            return {
                rounds: table.getHandRounds(hand),
                points: hand.points,
                matchSessionId: table.matchSessionId,
            };
        },
        getPublicMatch(userSession, freshHand) {
            return getPublicMatch(table, userSession, freshHand);
        },
    };
    return table;
}
exports.MatchTable = MatchTable;
const getPublicMatch = (table, userSession, freshHand = false) => {
    const { lobby } = table;
    const { gameLoop } = lobby;
    const winner = (gameLoop === null || gameLoop === void 0 ? void 0 : gameLoop.winner) || null;
    const rounds = (gameLoop === null || gameLoop === void 0 ? void 0 : gameLoop.currentHand) ? table.getHandRounds(gameLoop === null || gameLoop === void 0 ? void 0 : gameLoop.currentHand) : [];
    const players = lobby.players.filter((player) => Boolean(player));
    const currentPlayerIdx = players.findIndex((player) => player && player.session === userSession);
    const me = currentPlayerIdx !== -1 ? players[currentPlayerIdx] : null;
    const publicPlayers = (lobby.table ? lobby.table.getPlayersForehandFirst(me ? currentPlayerIdx : 0) : players).map((player) => player.getPublicPlayer(userSession));
    const teams = (gameLoop === null || gameLoop === void 0 ? void 0 : gameLoop.teams) || lobby.teams;
    const publicTeams = teams.map((team) => team.getPublicTeam(userSession));
    return {
        me,
        winner,
        options: lobby.options,
        matchSessionId: table.matchSessionId,
        state: table.state(),
        teams: publicTeams,
        players: publicPlayers,
        lastCommand: gameLoop === null || gameLoop === void 0 ? void 0 : gameLoop.lastCommand,
        lastCard: gameLoop === null || gameLoop === void 0 ? void 0 : gameLoop.lastCard,
        freshHand,
        rounds,
    };
};
