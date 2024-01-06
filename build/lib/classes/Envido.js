"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Envido = exports.EnvidoCalculator = void 0;
const types_1 = require("../../types");
const utils_1 = require("../utils");
const EMPTY_ENVIDO = {
    turn: 0,
    teamIdx: null,
    answer: null,
    winningPlayer: null,
    currentPlayer: null,
    players: [],
};
exports.EnvidoCalculator = {
    [types_1.EEnvidoCommand.ENVIDO]: (args) => {
        if (!args || args.stake === undefined || args.declineStake === undefined) {
            throw new Error("Envido calculator arguments are undefined");
        }
        const next = [
            types_1.EEnvidoCommand.REAL_ENVIDO,
            types_1.EEnvidoCommand.FALTA_ENVIDO,
            types_1.EAnswerCommand.QUIERO,
            types_1.EAnswerCommand.NO_QUIERO,
        ];
        return {
            accept: 2,
            decline: 1,
            next: args.stake < 2 ? [types_1.EEnvidoCommand.ENVIDO, ...next] : next,
        };
    },
    [types_1.EEnvidoCommand.REAL_ENVIDO]: () => ({
        accept: 3,
        decline: 1,
        next: [types_1.EEnvidoCommand.FALTA_ENVIDO, types_1.EAnswerCommand.QUIERO, types_1.EAnswerCommand.NO_QUIERO],
    }),
    [types_1.EEnvidoCommand.FALTA_ENVIDO]: (args) => {
        if (!args || !args.teams || !args.options) {
            throw new Error("Envido calculator arguments are undefined");
        }
        const { teams, options: { matchPoint }, } = args;
        const totals = teams.map((team) => team.points.malas + team.points.buenas);
        const higher = (0, utils_1.getMaxNumberIndex)(totals);
        const points = teams[higher].points;
        const accept = points.buenas > 0 || points.malas === matchPoint
            ? matchPoint - points.buenas
            : matchPoint - points.malas;
        return {
            accept: 0,
            decline: 2,
            replace: accept,
            next: [types_1.EAnswerCommand.QUIERO, types_1.EAnswerCommand.NO_QUIERO],
        };
    },
};
function* envidoTurnGeneratorSequence(envido) {
    let i = 0;
    while (i < envido.players.length && (envido.answer === null || envido.winner === null)) {
        const player = envido.players[envido.turn];
        envido.setCurrentPlayer(player);
        if (player.disabled) {
            envido.setCurrentPlayer(null);
        }
        if (envido.turn >= envido.players.length - 1) {
            envido.setTurn(0);
        }
        else {
            envido.setTurn(envido.turn + 1);
        }
        i++;
        yield envido;
    }
    envido.setCurrentPlayer(null);
    yield envido;
}
function Envido(teams, options, table) {
    const envido = Object.assign(Object.assign({}, EMPTY_ENVIDO), { started: false, finished: false, answered: false, accepted: false, possibleAnswerCommands: Object.values(types_1.EEnvidoCommand), declineStake: 0, winningPointsAnswer: -1, pointAnswersCount: 0, winner: null, stake: 0, teams,
        getPointsToGive() {
            if (!envido.winner) {
                return 0;
            }
            if (envido.answer === false) {
                return envido.declineStake;
            }
            if (options.faltaEnvido === 1) {
                return envido.winner.pointsToWin(options.matchPoint);
            }
            return envido.stake;
        },
        sayEnvido(command, player) {
            const playerTeamIdx = player.teamIdx;
            if (envido.teamIdx !== playerTeamIdx && envido.possibleAnswerCommands.includes(command)) {
                const opponentIdx = Number(!playerTeamIdx);
                const { accept, decline, replace, next } = exports.EnvidoCalculator[command]({
                    stake: envido.stake,
                    declineStake: envido.declineStake,
                    teams,
                    options,
                });
                envido.teamIdx = playerTeamIdx;
                envido.stake += accept;
                envido.declineStake += decline;
                envido.players = teams[opponentIdx].players;
                envido.started = true;
                envido.answered = false;
                turnGenerator = envidoTurnGeneratorSequence(envido);
                if (replace) {
                    envido.stake = replace;
                }
                envido.possibleAnswerCommands = next;
            }
            return envido;
        },
        sayPoints(player, points) {
            if (!envido.accepted) {
                throw new Error(types_1.GAME_ERROR.ENVIDO_NOT_ACCEPTED);
            }
            if (!envido.winningPlayer || envido.winningPointsAnswer === -1) {
                envido.winningPlayer = player;
                envido.winningPointsAnswer = points;
            }
            else {
                if (points > envido.winningPointsAnswer) {
                    envido.winningPlayer = player;
                    envido.winningPointsAnswer = points;
                }
                if (points === envido.winningPointsAnswer) {
                    const forehandWinner = table.getPlayerPosition(player.key, true) <
                        table.getPlayerPosition(envido.winningPlayer.key, true)
                        ? player
                        : envido.winningPlayer;
                    envido.winningPlayer = forehandWinner;
                }
            }
            envido.pointAnswersCount++;
            if (envido.pointAnswersCount >= envido.players.length) {
                envido.finished = true;
                envido.winner = teams[envido.winningPlayer.teamIdx];
            }
            return envido;
        },
        sayAnswer(player, answer) {
            const opponentIdx = Number(!player.teamIdx);
            if (answer === null || player.teamIdx === envido.teamIdx) {
                return envido;
            }
            if (answer) {
                envido.accepted = true;
                envido.turn = 0;
                table.players.forEach((player) => player.calculateEnvido());
                envido.players = table.getPlayersForehandFirst();
                turnGenerator = envidoTurnGeneratorSequence(envido);
            }
            if (answer === false) {
                envido.finished = true;
                const opponentTeam = teams[opponentIdx];
                envido.winner = opponentTeam;
            }
            envido.answered = true;
            envido.teamIdx = opponentIdx;
            envido.answer = answer;
            envido.turn = 0;
            return envido;
        },
        setTeam(idx) {
            envido.teamIdx = idx;
            return envido.teamIdx;
        },
        setTurn(turn) {
            envido.turn = turn;
            return envido.turn;
        },
        setCurrentPlayer(player) {
            envido.currentPlayer = player;
            return envido.currentPlayer;
        },
        getNextPlayer() {
            return turnGenerator.next();
        } });
    let turnGenerator = envidoTurnGeneratorSequence(envido);
    return envido;
}
exports.Envido = Envido;
