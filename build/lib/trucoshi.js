"use strict";
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
exports.Team = exports.Player = exports.Match = void 0;
var constants_1 = require("./constants");
var utils_1 = require("./utils");
function Deck() {
    var _deck = {
        cards: Object.keys(constants_1.CARDS),
        usedCards: [],
        takeCard: function () {
            var card = _deck.cards.shift();
            _deck.usedCards.push(card);
            return card;
        },
        shuffle: function () {
            _deck.cards = _deck.cards.concat(_deck.usedCards);
            _deck.usedCards = [];
            _deck.cards = (0, utils_1.shuffleArray)(_deck.cards);
            if (_deck.cards.length !== 40) {
                throw new Error("This is not good");
            }
            return _deck;
        }
    };
    return _deck;
}
function Table(teams, size) {
    var _table = {
        players: [],
        cards: [],
        forehandIdx: 0,
        nextTurn: function () {
            if (_table.forehandIdx < (size * 2) - 1) {
                _table.forehandIdx++;
            }
            else {
                _table.forehandIdx = 0;
            }
            return _table.player();
        },
        getPlayerPosition: function (id) {
            return _table.players.findIndex(function (p) { return p.id === id; });
        },
        player: function (idx) {
            if (idx !== undefined) {
                return _table.players[idx];
            }
            return _table.players[_table.forehandIdx];
        }
    };
    if (teams[0].players.length != size || teams[1].players.length != size) {
        throw new Error("Unexpected team size");
    }
    for (var i = 0; i < size; i++) {
        _table.players.push(teams[0].players[i]);
        _table.players.push(teams[1].players[i]);
    }
    return _table;
}
function Round() {
    var _round = {
        highest: -1,
        winner: null,
        cards: [],
        tie: false,
        play: function (_a) {
            var card = _a.card, player = _a.player;
            var value = (0, utils_1.getCardValue)(card);
            if (_round.highest > -1 && value === _round.highest) {
                _round.tie = true;
            }
            if (value > _round.highest) {
                _round.tie = false;
                _round.highest = value;
                _round.winner = player;
            }
            _round.cards.push({ card: card, player: player });
            return card;
        }
    };
    return _round;
}
function Match(teams, matchPoint) {
    if (teams === void 0) { teams = []; }
    if (matchPoint === void 0) { matchPoint = 9; }
    var deck = Deck().shuffle();
    var size = teams[0].players.length;
    if (size !== teams[1].players.length) {
        throw new Error("Team size mismatch");
    }
    function handsGeneratorSequence() {
        var hand, value, hasWinner;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!!_match.winner) return [3 /*break*/, 4];
                    deck.shuffle();
                    hand = _match.setCurrentHand(Hand(_match, deck, _match.hands.length + 1));
                    _match.pushHand(hand);
                    _a.label = 1;
                case 1:
                    if (!!hand.finished) return [3 /*break*/, 3];
                    value = hand.getNextPlayer().value;
                    if (value && value.finished) {
                        return [3 /*break*/, 1];
                    }
                    _match.setCurrentHand(value);
                    return [4 /*yield*/, _match];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 1];
                case 3:
                    _match.addPoints(hand.points);
                    _match.setCurrentHand(null);
                    hasWinner = (0, utils_1.checkMatchWinner)(teams, matchPoint);
                    if (hasWinner !== null) {
                        _match.setWinner(hasWinner);
                        _match.setCurrentHand(null);
                    }
                    _match.table.nextTurn();
                    return [3 /*break*/, 0];
                case 4: return [4 /*yield*/, _match];
                case 5:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }
    var handsGenerator = handsGeneratorSequence();
    var _match = {
        winner: null,
        teams: teams,
        hands: [],
        table: Table(teams, size),
        currentHand: null,
        play: function () {
            _match.getNextTurn();
            if (!_match.currentHand) {
                return;
            }
            return _match.currentHand.play();
        },
        addPoints: function (points) {
            _match.teams[0].addPoints(points[0]);
            _match.teams[1].addPoints(points[1]);
        },
        pushHand: function (hand) {
            _match.hands.push(hand);
        },
        setCurrentHand: function (hand) {
            _match.currentHand = hand;
            return _match.currentHand;
        },
        setWinner: function (winner) {
            _match.winner = winner;
        },
        getNextTurn: function () {
            return handsGenerator.next();
        }
    };
    return _match;
}
exports.Match = Match;
function PlayInstance(hand) {
    var _instance = {
        handIdx: hand.idx,
        roundIdx: hand.rounds.length,
        player: hand.currentPlayer,
        commands: [],
        rounds: hand.rounds,
        use: function (idx) {
            var player = hand.currentPlayer;
            var round = hand.currentRound;
            if (!player || !round) {
                return null;
            }
            var card = player.useCard(idx);
            if (card) {
                return round.play({ player: player, card: card });
            }
            return null;
        },
        say: function (command) {
            if (!hand.currentPlayer) {
                return null;
            }
            return hand;
        }
    };
    return _instance;
}
function Hand(match, deck, idx) {
    var truco = 1;
    match.teams.forEach(function (team) {
        team.players.forEach(function (player) {
            var playerHand = [deck.takeCard(), deck.takeCard(), deck.takeCard()];
            player.setHand(playerHand);
            // player.setHand(["5c", "4c", "6c"])
        });
    });
    function roundsGeneratorSequence() {
        var currentRoundIdx, forehandTeamIdx, i, round, previousRound, newTurn, teamIdx;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    currentRoundIdx = 0;
                    forehandTeamIdx = match.table.player(_hand.turn).teamIdx;
                    _a.label = 1;
                case 1:
                    if (!(currentRoundIdx < 3 && !_hand.finished)) return [3 /*break*/, 5];
                    i = 0;
                    round = Round();
                    _hand.setCurrentRound(round);
                    _hand.pushRound(round);
                    previousRound = _hand.rounds[currentRoundIdx - 1];
                    // Put previous round winner as forehand
                    if (previousRound && previousRound.winner && !previousRound.tie) {
                        newTurn = match.table.getPlayerPosition(previousRound.winner.id);
                        if (newTurn !== -1) {
                            _hand.setTurn(newTurn);
                        }
                    }
                    _a.label = 2;
                case 2:
                    if (!(i < match.table.players.length)) return [3 /*break*/, 4];
                    _hand.setCurrentPlayer(match.table.player(_hand.turn));
                    if (_hand.turn >= match.table.players.length - 1) {
                        _hand.setTurn(0);
                    }
                    else {
                        _hand.setTurn(_hand.turn + 1);
                    }
                    i++;
                    return [4 /*yield*/, _hand];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 2];
                case 4:
                    teamIdx = (0, utils_1.checkHandWinner)(_hand.rounds, forehandTeamIdx);
                    if (teamIdx !== null) {
                        _hand.addPoints(teamIdx, truco);
                        _hand.setFinished(true);
                    }
                    currentRoundIdx++;
                    return [3 /*break*/, 1];
                case 5: return [4 /*yield*/, _hand];
                case 6:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }
    var roundsGenerator = roundsGeneratorSequence();
    var _hand = {
        idx: idx,
        turn: Number(match.table.forehandIdx),
        rounds: [],
        finished: false,
        points: {
            0: 0,
            1: 0
        },
        currentRound: null,
        currentPlayer: null,
        play: function () {
            return PlayInstance(_hand);
        },
        pushRound: function (round) {
            _hand.rounds.push(round);
            return round;
        },
        setTurn: function (turn) {
            _hand.turn = turn;
            return match.table.player(_hand.turn);
        },
        addPoints: function (team, points) {
            _hand.points[team] = _hand.points[team] + points;
        },
        setCurrentRound: function (round) {
            _hand.currentRound = round;
            return _hand.currentRound;
        },
        setCurrentPlayer: function (player) {
            _hand.currentPlayer = player;
            return _hand.currentPlayer;
        },
        setFinished: function (finshed) {
            _hand.finished = finshed;
            return _hand.finished;
        },
        getNextPlayer: function () {
            return roundsGenerator.next();
        },
    };
    return _hand;
}
function Player(id, teamIdx) {
    var _player = {
        id: id,
        teamIdx: teamIdx,
        hand: [],
        usedHand: [],
        setHand: function (hand) {
            _player.hand = hand;
            _player.usedHand = [];
            return hand;
        },
        useCard: function (idx) {
            if (_player.hand[idx]) {
                var card = _player.hand.splice(idx, 1)[0];
                _player.usedHand.push(card);
                return card;
            }
            return null;
        }
    };
    return _player;
}
exports.Player = Player;
function Team(color, players) {
    var _team = {
        _players: new Map(),
        get players() {
            return Array.from(_team._players.values());
        },
        color: color,
        points: 0,
        addPoints: function (points) {
            _team.points += points;
            return _team.points;
        },
    };
    players.forEach(function (player) { return _team._players.set(player.id, player); });
    return _team;
}
exports.Team = Team;
