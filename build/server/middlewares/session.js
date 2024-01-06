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
exports.session = void 0;
const logger_1 = __importDefault(require("../../utils/logger"));
const types_1 = require("../../types");
const session = (server) => {
    server.io.on("connection", (socket) => {
        logger_1.default.debug("New socket connection %s", socket.id);
        logger_1.default.info(socket.data.user, "New connection session");
        if (socket.data.user) {
            socket.join(socket.data.user.session);
            server.emitSocketSession(socket);
        }
    });
    return (socket, next) => {
        socket.on("disconnect", (reason) => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            logger_1.default.info("Socket disconnected, reason?: %s", reason);
            if (socket.data.user) {
                const matchingSockets = yield server.io.in((_a = socket.data.user) === null || _a === void 0 ? void 0 : _a.session).fetchSockets();
                const isDisconnected = matchingSockets.length === 0;
                if (isDisconnected) {
                    const userSession = server.sessions.get(socket.data.user.session);
                    if (userSession) {
                        userSession.setAccount(null);
                        userSession.disconnect();
                    }
                }
            }
        }));
        const name = socket.handshake.auth.name;
        const sessionID = socket.handshake.auth.sessionID;
        if (sessionID) {
            const session = server.sessions.get(sessionID);
            if (session) {
                session.connect();
                session.setName(name);
                socket.data.user = session.getUserData();
                if (!socket.data.matches) {
                    socket.data.matches = new types_1.TMap();
                }
                return next();
            }
        }
        const session = server.createUserSession(socket, name || "Satoshi");
        socket.data.user = session.getUserData();
        session.connect();
        next();
    };
};
exports.session = session;
