"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserSession = void 0;
const logger_1 = __importDefault(require("../../utils/logger"));
const constants_1 = require("../constants");
const WAIT_RECONNECTION_ABANDON_DEBUG_MSG = `User disconnected from match or was inactive and timed out with no reconnection`;
function UserSession(key, username, session) {
    const userSession = {
        _name: username,
        key,
        account: null,
        session,
        online: true,
        ownedMatches: new Set(),
        reconnectTimeouts: new Map(),
        reconnectPromises: new Map(),
        get name() {
            return userSession.account ? userSession.account.name : userSession._name;
        },
        set name(value) {
            userSession._name = value;
        },
        getPublicInfo() {
            const { session: _session } = userSession, rest = __rest(userSession, ["session"]);
            return rest;
        },
        setAccount(user) {
            userSession.account = user;
        },
        getUserData() {
            const { key, name, session, account } = userSession;
            return { key, name, session, account };
        },
        waitReconnection(room, timeout) {
            return new Promise((resolve, reject) => {
                userSession.resolveWaitingPromises(room);
                logger_1.default.debug(userSession.getPublicInfo(), `User disconnected or left, waiting for ${timeout}ms to reconnect`);
                userSession.reconnectTimeouts.set(room, setTimeout(() => {
                    logger_1.default.debug(userSession.getPublicInfo(), WAIT_RECONNECTION_ABANDON_DEBUG_MSG);
                    reject();
                    userSession.reconnectPromises.delete(room);
                }, timeout + constants_1.PLAYER_TIMEOUT_GRACE));
                userSession.reconnectPromises.set(room, resolve);
            });
        },
        resolveWaitingPromises(room) {
            const promise = userSession.reconnectPromises.get(room);
            if (promise) {
                promise();
                userSession.reconnectPromises.delete(room);
            }
            const timeout = userSession.reconnectTimeouts.get(room);
            if (timeout) {
                clearTimeout(timeout);
                userSession.reconnectTimeouts.delete(room);
            }
        },
        reconnect(room) {
            userSession.resolveWaitingPromises(room);
            userSession.connect();
        },
        connect() {
            userSession.online = true;
        },
        disconnect() {
            userSession.online = false;
        },
        setName(id) {
            userSession.name = id;
        },
    };
    return userSession;
}
exports.UserSession = UserSession;
