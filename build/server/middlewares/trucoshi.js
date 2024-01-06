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
exports.trucoshi = void 0;
const classes_1 = require("../classes");
const types_1 = require("../../types");
const crypto_1 = require("crypto");
const logger_1 = __importDefault(require("../../utils/logger"));
const trucoshi = (server) => (socket, next) => {
    socket.on(types_1.EClientEvent.PING, (clientTime) => {
        socket.emit(types_1.EServerEvent.PONG, Date.now(), clientTime);
    });
    /**
     * Create Match
     */
    socket.on(types_1.EClientEvent.CREATE_MATCH, (callback) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        try {
            if (!socket.data.user) {
                throw new Error("Attempted to create a match without a session");
            }
            const userSession = server.sessions.getOrThrow(socket.data.user.session);
            if (!userSession) {
                throw new Error("Attempted to create a match without a user");
            }
            logger_1.default.debug(userSession.getPublicInfo(), "User creating new match...");
            const matchId = (0, crypto_1.randomUUID)().substring(0, 8);
            const table = (0, classes_1.MatchTable)(matchId, socket.data.user.session);
            logger_1.default.trace(userSession.getPublicInfo(), "User has created a new match table", table);
            userSession.ownedMatches.add(matchId);
            yield table.lobby.addPlayer(userSession.key, ((_a = userSession.account) === null || _a === void 0 ? void 0 : _a.name) || userSession.name, userSession.session, 0, true);
            server.chat.create(matchId);
            socket.join(matchId);
            server.tables.set(matchId, table);
            return callback({
                success: true,
                match: table.getPublicMatch(userSession.name),
                activeMatches: server.getSessionActiveMatches(userSession.session),
            });
        }
        catch (e) {
            logger_1.default.warn(e);
            return callback({ success: false });
        }
    }));
    /**
     * Start Match
     */
    socket.on(types_1.EClientEvent.START_MATCH, (matchId, callback) => __awaiter(void 0, void 0, void 0, function* () {
        var _b;
        try {
            const user = server.sessions.getOrThrow((_b = socket.data.user) === null || _b === void 0 ? void 0 : _b.session);
            logger_1.default.debug(user.getPublicInfo(), "User starting match...");
            if (matchId && user.ownedMatches.has(matchId)) {
                logger_1.default.trace("Server starting match...");
                yield server.startMatch(matchId);
                return callback({ success: true, matchSessionId: matchId });
            }
            logger_1.default.trace({ matchId }, "Match could not be started");
            callback({ success: false });
        }
        catch (e) {
            logger_1.default.error(e);
            callback({ success: false });
        }
    }));
    /**
     * Join Match
     */
    socket.on(types_1.EClientEvent.JOIN_MATCH, (matchSessionId, teamIdx, callback) => __awaiter(void 0, void 0, void 0, function* () {
        var _c, _d;
        try {
            const userSession = server.sessions.getOrThrow((_c = socket.data.user) === null || _c === void 0 ? void 0 : _c.session);
            const table = server.tables.get(matchSessionId);
            logger_1.default.debug(userSession.getPublicInfo(), "User joining match...");
            if (table) {
                yield table.lobby.addPlayer(userSession.key, ((_d = userSession.account) === null || _d === void 0 ? void 0 : _d.name) || userSession.name, userSession.session, teamIdx, userSession.ownedMatches.has(matchSessionId));
                socket.join(table.matchSessionId);
                server.emitMatchUpdate(table).catch(console.error);
                return callback({
                    success: true,
                    match: table.getPublicMatch(userSession.session),
                    activeMatches: server.getSessionActiveMatches(userSession.session),
                });
            }
            callback({ success: false });
        }
        catch (e) {
            logger_1.default.warn(e);
            callback({ success: false });
        }
    }));
    /**
     * Get public matches
     */
    socket.on(types_1.EClientEvent.LIST_MATCHES, (filters = {}, callback) => {
        const publicMatches = server.tables.getAll(filters);
        callback({ success: true, matches: publicMatches });
    });
    /**
     * Login
     */
    socket.on(types_1.EClientEvent.LOGIN, (account, identityJwt, callback) => {
        server.login(socket, account, identityJwt, callback);
    });
    /**
     * Logout
     */
    socket.on(types_1.EClientEvent.LOGOUT, (callback) => {
        server.logout(socket, callback);
    });
    /**
     * Fetch match with session
     */
    socket.on(types_1.EClientEvent.FETCH_MATCH, (matchId, callback) => {
        var _a, _b;
        if (!socket.data.user) {
            return callback({ success: false, match: null });
        }
        (_a = server.chat.rooms.get(matchId)) === null || _a === void 0 ? void 0 : _a.socket.emit(socket.id);
        const match = server.emitSocketMatch(socket, matchId);
        callback({ success: Boolean(match), match });
        (_b = server.chat.rooms.get(matchId)) === null || _b === void 0 ? void 0 : _b.socket.emit(socket.id);
    });
    /**
     * Set Player Ready
     */
    socket.on(types_1.EClientEvent.SET_PLAYER_READY, (matchId, ready, callback) => {
        var _a;
        try {
            if (!socket.data.user) {
                throw new Error("Session not found");
            }
            const table = server.tables.getOrThrow(matchId);
            const player = table.lobby.players.find((player) => { var _a; return player && player.session === ((_a = socket.data.user) === null || _a === void 0 ? void 0 : _a.session); });
            if (player) {
                player.setReady(ready);
                server.emitMatchUpdate(table, [socket.id]).catch(console.error);
                callback({ success: true, match: table.getPublicMatch((_a = socket.data.user) === null || _a === void 0 ? void 0 : _a.session) });
            }
        }
        catch (e) {
            logger_1.default.warn(e);
            callback({ success: false });
        }
    });
    /**
     * Leave Match
     */
    socket.on(types_1.EClientEvent.LEAVE_MATCH, (matchId) => {
        logger_1.default.trace({ matchId, socketId: socket.id }, "Client emitted LEAVE_MATCH event");
        server.leaveMatch(matchId, socket.id).then().catch(console.error);
    });
    next();
};
exports.trucoshi = trucoshi;
