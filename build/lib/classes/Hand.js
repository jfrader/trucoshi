"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Hand = void 0;
const logger_1 = __importDefault(require("../../utils/logger"));
const types_1 = require("../../types");
const utils_1 = require("../utils");
const Deck_1 = require("./Deck");
const Envido_1 = require("./Envido");
const Play_1 = require("./Play");
const Round_1 = require("./Round");
const Truco_1 = require("./Truco");
function* handTurnGeneratorSequence(match, hand) {
    let currentRoundIdx = 0;
    let forehandTeamIdx = match.table.getPlayerByPosition(hand.turn).teamIdx;
    while (currentRoundIdx < 3 && !hand.finished()) {
        const round = (0, Round_1.Round)();
        hand.setCurrentRound(round);
        hand.pushRound(round);
        let previousRound = hand.rounds[currentRoundIdx - 1];
        // Put previous round winner as forehand
        if (previousRound && previousRound.winner) {
            if (previousRound.tie) {
                hand.setTurn(match.table.forehandIdx);
            }
            else {
                const newTurn = match.table.getPlayerPosition(previousRound.winner.key);
                if (newTurn !== -1) {
                    hand.setTurn(newTurn);
                }
            }
        }
        while (round.turn < match.table.players.length) {
            while (hand.state === types_1.EHandState.WAITING_ENVIDO_ANSWER ||
                hand.state === types_1.EHandState.WAITING_ENVIDO_POINTS_ANSWER) {
                const { value } = hand.envido.getNextPlayer();
                if (value && value.currentPlayer) {
                    hand.setCurrentPlayer(value.currentPlayer);
                    yield hand;
                }
            }
            while (hand.state === types_1.EHandState.WAITING_FOR_TRUCO_ANSWER) {
                const { value } = hand.truco.getNextPlayer();
                if (value && value.currentPlayer) {
                    hand.setCurrentPlayer(value.currentPlayer);
                    yield hand;
                }
            }
            if (hand.truco.answer === false) {
                hand.setState(types_1.EHandState.FINISHED);
                break;
            }
            if (hand.envido.winner) {
                const simulatedPoints = hand.envido.winner.addPoints(match.options.matchPoint, hand.envido.getPointsToGive(), true);
                if (simulatedPoints.winner) {
                    hand.setState(types_1.EHandState.FINISHED);
                    break;
                }
            }
            const player = match.table.getPlayerByPosition(hand.turn);
            hand.setCurrentPlayer(player);
            if (match.teams.some((team) => team.isTeamDisabled())) {
                hand.setState(types_1.EHandState.FINISHED);
                break;
            }
            yield hand;
        }
        let winnerTeamIdx = (0, utils_1.checkHandWinner)(hand.rounds, forehandTeamIdx);
        if (match.teams[0].isTeamDisabled()) {
            winnerTeamIdx = 1;
        }
        if (match.teams[1].isTeamDisabled()) {
            winnerTeamIdx = 0;
        }
        if (winnerTeamIdx !== null) {
            hand.addPoints(winnerTeamIdx, hand.truco.state);
            hand.setState(types_1.EHandState.FINISHED);
        }
        if (hand.state === types_1.EHandState.FINISHED && hand.envido.winner) {
            hand.addPoints(hand.envido.winner.id, hand.envido.getPointsToGive());
        }
        currentRoundIdx++;
    }
    yield hand;
}
function Hand(match, idx) {
    for (const team of match.teams) {
        for (const player of team.players) {
            if (player.abandoned) {
                continue;
            }
            player.enable();
            player.setHand(match.deck.takeThree());
            player.resetCommands();
        }
    }
    const hand = {
        idx,
        started: false,
        turn: Number(match.table.forehandIdx),
        state: types_1.EHandState.WAITING_PLAY,
        rounds: [],
        envido: (0, Envido_1.Envido)(match.teams, match.options, match.table),
        truco: (0, Truco_1.Truco)(match.teams),
        setTurnCommands() {
            return setTurnCommands(match, hand);
        },
        points: [0, 0],
        currentRound: null,
        _currentPlayer: null,
        set currentPlayer(player) {
            hand._currentPlayer = player;
        },
        get currentPlayer() {
            let player = hand._currentPlayer;
            if (hand.state === types_1.EHandState.WAITING_ENVIDO_ANSWER ||
                hand.state === types_1.EHandState.WAITING_ENVIDO_POINTS_ANSWER) {
                player = hand.envido.currentPlayer;
            }
            if (hand.state === types_1.EHandState.WAITING_FOR_TRUCO_ANSWER) {
                player = hand.truco.currentPlayer;
            }
            return player;
        },
        play(prevHand) {
            return (0, Play_1.PlayInstance)(hand, prevHand, match.teams);
        },
        sayEnvidoPoints(player, points) {
            const { winner } = hand.envido.sayPoints(player, points);
            if (winner) {
                hand.endEnvido();
            }
            return points;
        },
        endEnvido() {
            if (hand.truco.waitingAnswer) {
                hand.setState(types_1.EHandState.WAITING_FOR_TRUCO_ANSWER);
            }
            else {
                hand.setState(types_1.EHandState.WAITING_PLAY);
            }
        },
        say(command, player) {
            try {
                commands[command](hand, player);
                hand.started = true;
                return command;
            }
            catch (e) {
                logger_1.default.error(e);
                return null;
            }
        },
        use(idx, card, burn) {
            const player = hand.currentPlayer;
            const round = hand.currentRound;
            if (!player || !round) {
                return null;
            }
            if (hand.state !== types_1.EHandState.WAITING_PLAY) {
                return null;
            }
            const playerCard = player.useCard(idx, card);
            if (playerCard) {
                hand.started = true;
                const card = round.use((0, Deck_1.PlayedCard)(player, playerCard, burn));
                hand.nextTurn();
                return card;
            }
            return null;
        },
        nextTurn() {
            var _a;
            if (hand.turn >= match.table.players.length - 1) {
                hand.setTurn(0);
            }
            else {
                hand.setTurn(hand.turn + 1);
            }
            (_a = hand.currentRound) === null || _a === void 0 ? void 0 : _a.nextTurn();
        },
        getNextTurn() {
            const player = roundsGenerator.next();
            hand.setTurnCommands();
            return player;
        },
        disablePlayer(player) {
            match.teams[player.teamIdx].disable(player);
        },
        addPoints(team, points) {
            hand.points[team] = hand.points[team] + points;
        },
        pushRound(round) {
            hand.rounds.push(round);
            return round;
        },
        setTurn(turn) {
            hand.turn = turn;
            return match.table.getPlayerByPosition(hand.turn);
        },
        setCurrentRound(round) {
            hand.currentRound = round;
            return hand.currentRound;
        },
        setCurrentPlayer(player) {
            hand._currentPlayer = player;
            return hand._currentPlayer;
        },
        setState(state) {
            hand.state = state;
            return hand.state;
        },
        finished: () => {
            return hand.state === types_1.EHandState.FINISHED;
        },
    };
    const roundsGenerator = handTurnGeneratorSequence(match, hand);
    return hand;
}
exports.Hand = Hand;
const setTurnCommands = (match, hand) => {
    var _a;
    match.table.players.forEach((player) => {
        player.resetCommands();
    });
    if (hand.rounds.length === 1) {
        if (hand.envido.teamIdx !== null && !hand.envido.answered) {
            match.teams[Number(!hand.envido.teamIdx)].players.forEach((player) => {
                hand.envido.possibleAnswerCommands.forEach((command) => {
                    player._commands.add(command);
                });
            });
        }
        if (hand.envido.accepted && !hand.envido.finished && hand.envido.winningPointsAnswer > 0) {
            (_a = hand.currentPlayer) === null || _a === void 0 ? void 0 : _a._commands.add(types_1.EEnvidoAnswerCommand.SON_BUENAS);
        }
        if (hand.currentPlayer &&
            !hand.envido.started &&
            (hand.truco.state < 2 || (hand.truco.state === 2 && hand.truco.answer === null))) {
            for (const key in types_1.EEnvidoCommand) {
                hand.currentPlayer._commands.add(key);
            }
        }
    }
    if (hand.envido.finished || !hand.envido.started) {
        if (hand.truco.waitingAnswer) {
            match.teams[Number(!hand.truco.teamIdx)].players.forEach((player) => {
                const nextCommand = hand.truco.getNextTrucoCommand();
                if (nextCommand) {
                    player._commands.add(nextCommand);
                }
                player._commands.add(types_1.EAnswerCommand.QUIERO);
                player._commands.add(types_1.EAnswerCommand.NO_QUIERO);
            });
        }
        else {
            match.table.players.forEach((player) => {
                if (hand.truco.teamIdx !== player.teamIdx) {
                    const nextCommand = hand.truco.getNextTrucoCommand();
                    if (nextCommand) {
                        player._commands.add(nextCommand);
                    }
                }
                player._commands.add(types_1.ESayCommand.MAZO);
            });
        }
    }
};
const trucoCommand = (hand, player) => {
    hand.truco.sayTruco(player);
    hand.setState(types_1.EHandState.WAITING_FOR_TRUCO_ANSWER);
};
const commands = {
    [types_1.ESayCommand.MAZO]: (hand, player) => {
        hand.disablePlayer(player);
        hand.nextTurn();
    },
    [types_1.EAnswerCommand.QUIERO]: (hand, player) => {
        if (hand.state === types_1.EHandState.WAITING_FOR_TRUCO_ANSWER) {
            hand.truco.sayAnswer(player, true);
            hand.setState(types_1.EHandState.WAITING_PLAY);
        }
        if (hand.state === types_1.EHandState.WAITING_ENVIDO_ANSWER) {
            hand.envido.sayAnswer(player, true);
            hand.setState(types_1.EHandState.WAITING_ENVIDO_POINTS_ANSWER);
        }
    },
    [types_1.EAnswerCommand.NO_QUIERO]: (hand, player) => {
        if (hand.state === types_1.EHandState.WAITING_FOR_TRUCO_ANSWER) {
            hand.truco.sayAnswer(player, false);
            hand.setState(types_1.EHandState.WAITING_PLAY);
        }
        if (hand.state === types_1.EHandState.WAITING_ENVIDO_ANSWER) {
            hand.envido.sayAnswer(player, false);
            hand.endEnvido();
        }
    },
    [types_1.EEnvidoAnswerCommand.SON_BUENAS]: (hand, player) => {
        if (hand.state === types_1.EHandState.WAITING_ENVIDO_POINTS_ANSWER) {
            hand.sayEnvidoPoints(player, 0);
        }
    },
    [types_1.ETrucoCommand.TRUCO]: trucoCommand,
    [types_1.ETrucoCommand.RE_TRUCO]: trucoCommand,
    [types_1.ETrucoCommand.VALE_CUATRO]: trucoCommand,
    [types_1.EEnvidoCommand.ENVIDO]: (hand, player) => {
        hand.envido.sayEnvido(types_1.EEnvidoCommand.ENVIDO, player);
        hand.setState(types_1.EHandState.WAITING_ENVIDO_ANSWER);
    },
    [types_1.EEnvidoCommand.REAL_ENVIDO]: (hand, player) => {
        hand.envido.sayEnvido(types_1.EEnvidoCommand.REAL_ENVIDO, player);
        hand.setState(types_1.EHandState.WAITING_ENVIDO_ANSWER);
    },
    [types_1.EEnvidoCommand.FALTA_ENVIDO]: (hand, player) => {
        hand.envido.sayEnvido(types_1.EEnvidoCommand.FALTA_ENVIDO, player);
        hand.setState(types_1.EHandState.WAITING_ENVIDO_ANSWER);
    },
    [types_1.EFlorCommand.FLOR]: () => { },
    [types_1.EFlorCommand.CONTRAFLOR]: () => { },
};
