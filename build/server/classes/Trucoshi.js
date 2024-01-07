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
exports.Trucoshi = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = require("crypto");
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const types_1 = require("../../types");
const constants_1 = require("../constants");
const Chat_1 = require("./Chat");
const UserSession_1 = require("./UserSession");
const logger_1 = __importDefault(require("../../utils/logger"));
const Store_1 = require("../../store/classes/Store");
const client_1 = require("../../store/client");
const lightningAccounts_1 = require("../../utils/config/lightningAccounts");
const redis_adapter_1 = require("@socket.io/redis-adapter");
const client_2 = require("../../accounts/client");
const redis_1 = require("redis");
const client_3 = require("@prisma/client");
class MatchTableMap extends types_1.TMap {
    getAll(filters = {}) {
        let results = [];
        for (let value of this.values()) {
            if (!filters.state || !filters.state.length || filters.state.includes(value.state())) {
                results.push(value.getPublicMatchInfo());
            }
        }
        return results;
    }
}
const Trucoshi = ({ port, origin, serverVersion, }) => {
    const httpServer = (0, http_1.createServer)();
    const pubClient = (0, redis_1.createClient)({ url: process.env.REDIS_URL });
    const subClient = pubClient.duplicate();
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            credentials: true,
            origin,
            methods: ["GET", "POST"],
        },
    });
    const store = (0, Store_1.Store)(client_1.prismaClient);
    const chat = (0, Chat_1.Chat)(io);
    const sessions = new types_1.TMap(); // sessionId (token), user
    const tables = new MatchTableMap(); // sessionId, table
    const turns = new types_1.TMap(); // sessionId, play instance, play promise resolve and type
    const server = {
        sessions,
        store,
        tables,
        turns,
        io,
        httpServer,
        chat,
        listen(callback) {
            client_2.accountsApi.auth
                .getAuth()
                .catch((e) => {
                logger_1.default.error(e, "Failed to login to lightning-accounts");
            })
                .then(() => {
                logger_1.default.info("Logged in to lightning-accounts");
                return Promise.all([pubClient.connect(), subClient.connect()]);
            })
                .then(() => logger_1.default.info("Connected to redis"))
                .catch((e) => {
                logger_1.default.error(e, "Failed to connect to Redis");
            })
                .finally(() => {
                io.adapter((0, redis_adapter_1.createAdapter)(pubClient, subClient));
                io.listen(port);
                server.chat = (0, Chat_1.Chat)(io);
                callback(io);
            });
        },
        getSessionActiveMatches(session) {
            if (!session) {
                return [];
            }
            return server.tables
                .findAll((table) => {
                if (table.state() === client_3.EMatchState.FINISHED) {
                    return false;
                }
                return Boolean(table.isSessionPlaying(session));
            })
                .map((match) => match.getPublicMatchInfo());
        },
        createUserSession(socket, id, token) {
            const session = token || (0, crypto_1.randomUUID)();
            const key = (0, crypto_1.randomUUID)();
            const userSession = (0, UserSession_1.UserSession)(key, id || "Satoshi", session);
            socket.data.user = userSession;
            socket.data.matches = new types_1.TMap();
            server.sessions.set(session, userSession);
            return userSession;
        },
        login(socket, me, identityJwt, callback) {
            return __awaiter(this, void 0, void 0, function* () {
                if (!socket.data.user) {
                    return callback({ success: false });
                }
                try {
                    let session = server.sessions.getOrThrow(socket.data.user.session);
                    const payload = jsonwebtoken_1.default.verify(identityJwt, (0, lightningAccounts_1.getPublicKey)());
                    if (!payload.sub || me.id !== Number(payload.sub)) {
                        return callback({ success: false });
                    }
                    const existingSession = server.sessions.find((s) => { var _a; return ((_a = s.account) === null || _a === void 0 ? void 0 : _a.id) === payload.sub; });
                    const res = yield client_2.accountsApi.users.usersDetail(payload.sub);
                    if (existingSession) {
                        socket.data.user = existingSession.getUserData();
                        session = existingSession;
                    }
                    session.setAccount(res.data);
                    logger_1.default.info(res.data, "Logging in account");
                    return callback({ success: true });
                }
                catch (e) {
                    logger_1.default.error(e);
                    return callback({ success: false });
                }
            });
        },
        logout(socket, callback) {
            if (!socket.data.user) {
                return callback({ success: false });
            }
            try {
                const session = server.sessions.getOrThrow(socket.data.user.session);
                session.setAccount(null);
                return callback({ success: true });
            }
            catch (e) {
                logger_1.default.error(e);
                return callback({ success: false });
            }
        },
        emitSocketSession(socket) {
            return __awaiter(this, void 0, void 0, function* () {
                if (!socket.data.user) {
                    return;
                }
                const activeMatches = server.getSessionActiveMatches(socket.data.user.session);
                socket.emit(types_1.EServerEvent.SET_SESSION, socket.data.user, serverVersion, activeMatches);
            });
        },
        getTableSockets(table, callback) {
            var _a;
            return __awaiter(this, void 0, void 0, function* () {
                const allSockets = yield server.io.sockets.adapter.fetchSockets({
                    rooms: new Set([table.matchSessionId]),
                });
                const players = [];
                const playerSockets = [];
                const spectatorSockets = [];
                for (const playerSocket of allSockets) {
                    if (!((_a = playerSocket.data.user) === null || _a === void 0 ? void 0 : _a.session)) {
                        spectatorSockets.push(playerSocket);
                        // don't await for spectators
                        callback === null || callback === void 0 ? void 0 : callback(playerSocket, null);
                        continue;
                    }
                    const player = table.isSessionPlaying(playerSocket.data.user.session);
                    if (player) {
                        players.push(player.getPublicPlayer(playerSocket.data.user.session));
                        playerSockets.push(playerSocket);
                    }
                    else {
                        spectatorSockets.push(playerSocket);
                    }
                    if (callback) {
                        yield callback(playerSocket, player);
                    }
                }
                return { sockets: playerSockets, spectators: spectatorSockets, players };
            });
        },
        emitMatchUpdate(table, skipSocketIds = []) {
            return __awaiter(this, void 0, void 0, function* () {
                logger_1.default.trace(table.getPublicMatchInfo(), "Emitting match update to all sockets");
                yield server.getTableSockets(table, (playerSocket, player) => __awaiter(this, void 0, void 0, function* () {
                    if (skipSocketIds.includes(playerSocket.id) || !playerSocket.data.user) {
                        return;
                    }
                    playerSocket.emit(types_1.EServerEvent.UPDATE_MATCH, table.getPublicMatch(player ? playerSocket.data.user.session : undefined));
                }));
            });
        },
        emitWaitingPossibleSay(play, table, freshHand = false) {
            return __awaiter(this, void 0, void 0, function* () {
                logger_1.default.debug({ match: table.getPublicMatchInfo(), handIdx: play.handIdx }, "Emitting match possible players say");
                return new Promise((resolve, reject) => {
                    return server
                        .getTableSockets(table, (playerSocket, player) => __awaiter(this, void 0, void 0, function* () {
                        var _a;
                        if (!player) {
                            playerSocket.emit(types_1.EServerEvent.UPDATE_MATCH, table.getPublicMatch());
                            return;
                        }
                        if (!playerSocket.data.matches) {
                            logger_1.default.error(Error("Player socket doesn't have data.matches!!!"));
                            return;
                        }
                        if ((_a = playerSocket.data.matches.get(table.matchSessionId)) === null || _a === void 0 ? void 0 : _a.isWaitingForSay) {
                            return;
                        }
                        logger_1.default.trace({ match: table.getPublicMatchInfo(), player: player.getPublicPlayer() }, "Emitting waiting possible say to a player");
                        playerSocket.emit(types_1.EServerEvent.WAITING_POSSIBLE_SAY, table.getPublicMatch(player.session, freshHand), (data) => {
                            if (!data) {
                                return;
                            }
                            if (!play.waitingPlay) {
                                logger_1.default.trace({ match: table.getPublicMatchInfo(), player: player.getPublicPlayer() }, "Tried to say something but someone said something already");
                                return;
                            }
                            const { command } = data;
                            server
                                .sayCommand(table, play, player, command)
                                .then((command) => {
                                resolve(command);
                                server.sessions.getOrThrow(player.session).reconnect(table.matchSessionId);
                            })
                                .catch(reject);
                        });
                    }))
                        .catch(console.error);
                });
            });
        },
        emitWaitingForPlay(play, table, freshHand) {
            return __awaiter(this, void 0, void 0, function* () {
                return new Promise((resolve, reject) => {
                    server
                        .emitWaitingPossibleSay(play, table, freshHand)
                        .then(() => resolve("say"))
                        .catch(logger_1.default.error);
                    return server
                        .getTableSockets(table, (playerSocket, player) => __awaiter(this, void 0, void 0, function* () {
                        var _a, _b;
                        if (!player) {
                            return;
                        }
                        if (!playerSocket.data.matches) {
                            logger_1.default.error(new Error("Player socket doesn't have data.matches!"));
                            return;
                        }
                        if ((_a = playerSocket.data.matches.get(table.matchSessionId)) === null || _a === void 0 ? void 0 : _a.isWaitingForPlay) {
                            return;
                        }
                        if (player.session === ((_b = play.player) === null || _b === void 0 ? void 0 : _b.session)) {
                            logger_1.default.debug({
                                match: table.getPublicMatchInfo(),
                                player: player.getPublicPlayer(),
                                handIdx: play.handIdx,
                            }, "Emitting waiting play to a player");
                            playerSocket.emit(types_1.EServerEvent.WAITING_PLAY, table.getPublicMatch(player.session), (data) => {
                                if (!data) {
                                    return reject(new Error(types_1.EServerEvent.WAITING_PLAY + " callback returned empty"));
                                }
                                if (!play.waitingPlay) {
                                    logger_1.default.trace({ match: table.getPublicMatchInfo(), player: player.getPublicPlayer() }, "Tried to play a card but play is not waiting a play");
                                    return;
                                }
                                const { cardIdx, card } = data;
                                server
                                    .playCard(table, play, player, cardIdx, card)
                                    .then(() => {
                                    resolve("play");
                                    server.sessions.getOrThrow(player.session).reconnect(table.matchSessionId);
                                })
                                    .catch(reject);
                            });
                        }
                    }))
                        .catch(console.error);
                });
            });
        },
        sayCommand(table, play, player, command) {
            return new Promise((resolve, reject) => {
                if (command || command === 0) {
                    logger_1.default.trace({ player, command }, "Attempt to say command");
                    const saidCommand = play.say(command, player);
                    if (saidCommand || saidCommand === 0) {
                        logger_1.default.trace({ player, command }, "Say command success");
                        clearTimeout(server.turns.getOrThrow(table.matchSessionId).timeout);
                        server.chat.rooms
                            .getOrThrow(table.matchSessionId)
                            .command(player.teamIdx, saidCommand);
                        return server
                            .resetSocketsMatchState(table)
                            .then(() => resolve(saidCommand))
                            .catch(reject);
                    }
                    return reject(new Error("Invalid Command " + command));
                }
                return reject(new Error("Undefined Command"));
            });
        },
        playCard(table, play, player, cardIdx, card) {
            return new Promise((resolve, reject) => {
                if (cardIdx !== undefined && card) {
                    logger_1.default.trace({ player, card, cardIdx }, "Attempt to play card");
                    const playedCard = play.use(cardIdx, card);
                    if (playedCard) {
                        logger_1.default.trace({ player, card, cardIdx }, "Play card success");
                        clearTimeout(server.turns.getOrThrow(table.matchSessionId).timeout);
                        server.chat.rooms.getOrThrow(table.matchSessionId).card(player, playedCard);
                        return server.resetSocketsMatchState(table).then(resolve).catch(reject);
                    }
                    return reject(new Error("Invalid Card " + card));
                }
                return reject(new Error("Undefined Card"));
            });
        },
        resetSocketsMatchState(table) {
            return __awaiter(this, void 0, void 0, function* () {
                yield server.getTableSockets(table, (playerSocket) => __awaiter(this, void 0, void 0, function* () {
                    if (!playerSocket.data.matches) {
                        return logger_1.default.error(new Error("Player socket doesn't have data.matches!!!"));
                    }
                    playerSocket.data.matches.set(table.matchSessionId, {
                        isWaitingForPlay: false,
                        isWaitingForSay: false,
                    });
                }));
            });
        },
        emitPreviousHand(hand, table) {
            return __awaiter(this, void 0, void 0, function* () {
                logger_1.default.debug(table.getPublicMatchInfo(), "Emitting previous hand to players");
                const previousHand = table.getPreviousHand(hand);
                const promises = [];
                yield server.getTableSockets(table, (playerSocket, player) => __awaiter(this, void 0, void 0, function* () {
                    promises.push(new Promise((resolvePlayer, rejectPlayer) => {
                        if (!player || !hand) {
                            return rejectPlayer();
                        }
                        playerSocket.emit(types_1.EServerEvent.PREVIOUS_HAND, previousHand, resolvePlayer);
                        setTimeout(rejectPlayer, table.lobby.options.handAckTime + constants_1.PLAYER_TIMEOUT_GRACE);
                    }).catch(console.error));
                }));
                table.lobby.teams.map((team) => {
                    server.chat.rooms
                        .getOrThrow(table.matchSessionId)
                        .system(`${team.name}: +${previousHand.points[team.id]}`);
                });
                logger_1.default.trace(table.getPublicMatchInfo(), "Previous hand timeout has finished, all players settled for next hand");
                yield Promise.allSettled(promises);
            });
        },
        setTurnTimeout(table, player, user, onReconnection, onTimeout) {
            logger_1.default.trace({ player, options: table.lobby.options }, "Setting turn timeout");
            player.setTurnExpiration(table.lobby.options.turnTime, table.lobby.options.abandonTime);
            const chat = server.chat.rooms.getOrThrow(table.matchSessionId);
            return setTimeout(() => {
                logger_1.default.trace({ match: table.getPublicMatchInfo(), player: player.getPublicPlayer() }, "Turn timed out, disconnecting");
                table.playerDisconnected(player);
                user
                    .waitReconnection(table.matchSessionId, table.lobby.options.abandonTime)
                    .then(() => {
                    logger_1.default.trace({ match: table.getPublicMatchInfo(), player: player.getPublicPlayer() }, "Player reconnected");
                    table.playerReconnected(player);
                    onReconnection();
                })
                    .catch(() => {
                    logger_1.default.trace({ match: table.getPublicMatchInfo(), player: player.getPublicPlayer() }, "Player abandoned");
                    table.playerAbandoned(player);
                    chat.system(`${player.id} se retiro de la partida.`);
                    onTimeout();
                })
                    .finally(() => server.emitMatchUpdate(table).catch(logger_1.default.error));
            }, table.lobby.options.turnTime + constants_1.PLAYER_TIMEOUT_GRACE);
        },
        onTurn(table, play) {
            logger_1.default.trace({ match: table.getPublicMatchInfo(), player: play.player, handIdx: play.handIdx }, "Turn started");
            return new Promise((resolve, reject) => {
                var _a;
                const session = (_a = play.player) === null || _a === void 0 ? void 0 : _a.session;
                if (!session || !play || !play.player) {
                    throw new Error("No session, play instance or player found");
                }
                const player = play.player;
                const user = server.sessions.getOrThrow(session);
                const turn = () => server
                    .emitWaitingForPlay(play, table, play.freshHand)
                    .then(() => {
                    resolve();
                })
                    .catch((e) => {
                    logger_1.default.debug(e, "ONTURN CALLBACK ERROR");
                    turn();
                });
                turn();
                const timeout = server.setTurnTimeout(table, player, user, turn, () => server
                    .sayCommand(table, play, player, types_1.ESayCommand.MAZO)
                    .catch(logger_1.default.error)
                    .finally(resolve));
                server.turns.set(table.matchSessionId, {
                    play,
                    resolve,
                    timeout,
                });
            });
        },
        onTruco(table, play) {
            logger_1.default.trace({ match: table.getPublicMatchInfo(), player: play.player, handIdx: play.handIdx }, "Truco answer turn started");
            return new Promise((resolve, reject) => {
                var _a;
                const session = (_a = play.player) === null || _a === void 0 ? void 0 : _a.session;
                if (!session || !play || !play.player) {
                    throw new Error("No session, play instance or player found");
                }
                const turn = () => server
                    .emitWaitingPossibleSay(play, table)
                    .then(() => resolve())
                    .catch((e) => {
                    logger_1.default.debug(e, "ONTRUCO CALLBACK ERROR");
                    // reject(e)
                    turn();
                });
                turn();
                const player = play.player;
                const user = server.sessions.getOrThrow(session);
                const timeout = server.setTurnTimeout(table, player, user, turn, () => server
                    .sayCommand(table, play, player, types_1.EAnswerCommand.NO_QUIERO)
                    .catch(logger_1.default.error)
                    .finally(resolve));
                server.turns.set(table.matchSessionId, {
                    play,
                    resolve,
                    timeout,
                });
            });
        },
        onEnvido(table, play, isPointsRound) {
            logger_1.default.trace({
                match: table.getPublicMatchInfo(),
                player: play.player,
                handIdx: play.handIdx,
                isPointsRound,
            }, "Envido answer turn started");
            return new Promise((resolve, reject) => {
                var _a;
                const session = (_a = play.player) === null || _a === void 0 ? void 0 : _a.session;
                if (!session || !play || !play.player) {
                    throw new Error("No session, play instance or player found");
                }
                const turn = () => server
                    .emitWaitingPossibleSay(play, table)
                    .then(() => resolve())
                    .catch((e) => {
                    logger_1.default.debug(e, "ONENVIDO CALLBACK ERROR");
                    turn();
                });
                turn();
                const player = play.player;
                const user = server.sessions.getOrThrow(session);
                const timeout = server.setTurnTimeout(table, player, user, turn, () => {
                    if (isPointsRound) {
                        return server.sayCommand(table, play, player, 0).catch(logger_1.default.error).finally(resolve);
                    }
                    server
                        .sayCommand(table, play, player, types_1.EAnswerCommand.NO_QUIERO)
                        .catch(logger_1.default.error)
                        .finally(resolve);
                });
                server.turns.set(table.matchSessionId, {
                    play,
                    resolve,
                    timeout,
                });
            });
        },
        onHandFinished(table, hand) {
            if (!hand) {
                logger_1.default.warn(new Error("Hand finished but there's no previous hand!"));
                return Promise.resolve();
            }
            logger_1.default.trace(`Table hand finished - Table State: ${table.state()}`);
            return new Promise((resolve, reject) => {
                server
                    .emitPreviousHand(hand, table)
                    .then(resolve)
                    .catch((e) => {
                    logger_1.default.error(e, "ONHANDFINISHED CALLBACK ERROR");
                    reject(e);
                });
            });
        },
        onWinner(table, winner) {
            return new Promise((resolve) => {
                logger_1.default.debug(table.getPublicMatchInfo(), "Match has finished with a winner");
                const chat = server.chat.rooms.getOrThrow(table.matchSessionId);
                chat.system(`${winner.name} es el equipo ganador!`);
                server
                    .emitMatchUpdate(table)
                    .then(() => server.getTableSockets(table, (playerSocket, player) => __awaiter(this, void 0, void 0, function* () {
                    if (player) {
                        const activeMatches = server.getSessionActiveMatches(player.session);
                        logger_1.default.trace({ activeMatches }, "Match finished, updating active matches");
                        playerSocket.emit(types_1.EServerEvent.UPDATE_ACTIVE_MATCHES, activeMatches);
                    }
                })))
                    .catch((e) => {
                    logger_1.default.error(e, "ONWINNER CALLBACK ERROR");
                    resolve();
                });
                setTimeout(() => {
                    server.cleanupMatchTable(table);
                }, constants_1.MATCH_FINISHED_CLEANUP_TIMEOUT);
            });
        },
        startMatch(matchSessionId) {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    const table = server.tables.getOrThrow(matchSessionId);
                    server.resetSocketsMatchState(table).catch(logger_1.default.error);
                    if (table && !table.lobby.gameLoop) {
                        table.lobby
                            .startMatch()
                            .onHandFinished(server.onHandFinished.bind(this, table))
                            .onTurn(server.onTurn.bind(null, table))
                            .onEnvido(server.onEnvido.bind(null, table))
                            .onTruco(server.onTruco.bind(null, table))
                            .onWinner(server.onWinner.bind(null, table))
                            .begin()
                            .then(() => logger_1.default.trace(table.getPublicMatchInfo(), "Match finished"))
                            .catch(logger_1.default.error);
                        server.tables.set(matchSessionId, table);
                        server
                            .getTableSockets(table, (playerSocket, player) => __awaiter(this, void 0, void 0, function* () {
                            if (player) {
                                playerSocket.emit(types_1.EServerEvent.UPDATE_ACTIVE_MATCHES, server.getSessionActiveMatches(player.session));
                            }
                        }))
                            .catch(console.error);
                        return;
                    }
                }
                catch (e) {
                    logger_1.default.error(e);
                }
            });
        },
        emitSocketMatch(socket, matchId) {
            var _a;
            if (!matchId) {
                return null;
            }
            const currentTable = server.tables.get(matchId);
            if (currentTable) {
                socket.join(currentTable.matchSessionId);
                if (!((_a = socket.data.user) === null || _a === void 0 ? void 0 : _a.session)) {
                    return null;
                }
                if (socket.data.matches) {
                    socket.data.matches.set(currentTable.matchSessionId, {
                        isWaitingForPlay: false,
                        isWaitingForSay: false,
                    });
                }
                const { play, resolve } = server.turns.get(currentTable.matchSessionId) || {};
                if (play && play.player && currentTable.isSessionPlaying(socket.data.user.session)) {
                    if (play.state === types_1.EHandState.WAITING_PLAY &&
                        socket.data.user.session === play.player.session) {
                        logger_1.default.debug(Object.assign(Object.assign({}, socket.data.user), { socket: socket.id }), "Emitting user's socket current playing match: waiting for play");
                        server.emitWaitingForPlay(play, currentTable).then(resolve).catch(logger_1.default.error);
                    }
                    else {
                        logger_1.default.debug(Object.assign(Object.assign({}, socket.data.user), { socket: socket.id }), "Emitting user's socket current playing match: waiting possible say");
                        server.emitWaitingPossibleSay(play, currentTable).then(resolve).catch(logger_1.default.error);
                    }
                }
                return currentTable.getPublicMatch(socket.data.user.session);
            }
            return null;
        },
        leaveMatch(matchId, socketId) {
            return new Promise((resolve) => {
                logger_1.default.debug({ matchId, socketId }, "Socket trying to leave a match");
                const playingMatch = _getPossiblePlayingMatch(matchId, socketId);
                if (!playingMatch) {
                    return resolve();
                }
                if (!playingMatch.player || !playingMatch.user) {
                    logger_1.default.trace({ matchId, socketId }, "Socket left a match but isn't a player");
                    return resolve();
                }
                const { table, player, user } = playingMatch;
                if (table.state() === client_3.EMatchState.FINISHED) {
                    server.removePlayerAndCleanup(table, player);
                    return resolve();
                }
                if (player && table.state() !== client_3.EMatchState.STARTED) {
                    table.playerDisconnected(player);
                    const userSession = server.sessions.getOrThrow(user.session);
                    userSession
                        .waitReconnection(table.matchSessionId, constants_1.PLAYER_LOBBY_TIMEOUT)
                        .then(() => {
                        table.playerReconnected(player);
                    })
                        .catch(() => {
                        table.playerAbandoned(player);
                        server.removePlayerAndCleanup(table, player);
                    })
                        .finally(() => server.emitMatchUpdate(table).catch(logger_1.default.error));
                }
            });
        },
        removePlayerAndCleanup(table, player) {
            try {
                const lobby = table.lobby.removePlayer(player.session);
                if (lobby.isEmpty()) {
                    server.cleanupMatchTable(table);
                }
            }
            catch (e) {
                logger_1.default.error(e);
            }
        },
        cleanupMatchTable(table) {
            const matchId = table.matchSessionId;
            try {
                for (const player of table.lobby.players) {
                    const user = server.sessions.getOrThrow(player.session);
                    user.resolveWaitingPromises(matchId);
                    if (player.isOwner) {
                        user.ownedMatches.delete(matchId);
                    }
                }
            }
            catch (e) {
                logger_1.default.error(e);
            }
            finally {
                server.tables.delete(matchId);
                server.chat.delete(matchId);
            }
        },
    };
    const _getPossiblePlayingMatch = (room, socketId) => {
        const socket = server.io.sockets.sockets.get(socketId);
        if (!socket || !socket.data.user) {
            return null;
        }
        const table = server.tables.get(room);
        if (table) {
            const player = table.isSessionPlaying(socket.data.user.session);
            if (player) {
                return { table, player, user: socket.data.user };
            }
            return { table };
        }
        return null;
    };
    io.of("/").adapter.on("leave-room", (room, socketId) => {
        logger_1.default.info({ room, socketId }, "Player socket left match room");
        server.leaveMatch(room, socketId).catch(logger_1.default.error);
    });
    io.of("/").adapter.on("join-room", (room, socketId) => {
        const playingMatch = _getPossiblePlayingMatch(room, socketId);
        if (!playingMatch || !playingMatch.user) {
            return;
        }
        const { table, user } = playingMatch;
        const userSession = server.sessions.getOrThrow(user.session);
        logger_1.default.debug({ matchId: room, socketId }, "Player socket joined match room");
        userSession.reconnect(table.matchSessionId);
    });
    return server;
};
exports.Trucoshi = Trucoshi;
