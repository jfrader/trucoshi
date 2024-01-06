"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Chat = void 0;
const crypto_1 = require("crypto");
const types_1 = require("../../types");
const SYSTEM_ID = "system";
const ChatUser = (id) => {
    return {
        id,
        key: id,
    };
};
const ChatMessage = ({ user, system, command, content, card, }) => {
    return {
        id: (0, crypto_1.randomUUID)(),
        date: Math.floor(Date.now() / 1000),
        user,
        content: content || "",
        system: system || false,
        command: command || false,
        card: card || false,
    };
};
const ChatRoom = (io, id) => {
    const room = {
        id,
        messages: [],
        socket: {
            emit(socket) {
                const userSocket = io.sockets.sockets.get(socket);
                userSocket === null || userSocket === void 0 ? void 0 : userSocket.emit(types_1.EServerEvent.UPDATE_CHAT, { id: room.id, messages: room.messages });
            },
        },
        send(user, content) {
            const message = ChatMessage({
                user,
                content,
            });
            room.messages.push(message);
            room.emit(message);
        },
        system(content) {
            const message = ChatMessage({
                user: ChatUser(SYSTEM_ID),
                content,
                system: true,
            });
            room.messages.push(message);
            room.emit(message);
        },
        command(team, command) {
            const message = ChatMessage({
                user: ChatUser(team.toString()),
                content: `${command}`,
                command: true,
            });
            room.messages.push(message);
            room.emit(message);
        },
        card(user, card) {
            const message = ChatMessage({
                user,
                content: String(card),
                card: true,
            });
            room.messages.push(message);
            room.emit(message);
        },
        emit(message) {
            io.to(room.id).emit(types_1.EServerEvent.UPDATE_CHAT, { id: room.id, messages: room.messages }, message);
        },
    };
    return room;
};
const Chat = (io) => {
    const chat = {
        rooms: new types_1.TMap(),
        create(id) {
            if (chat.rooms.has(id)) {
                return;
            }
            const room = ChatRoom(io, id);
            chat.rooms.set(id, room);
        },
        delete(id) {
            chat.rooms.delete(id);
        },
    };
    const adapter = io.of("/").adapter;
    adapter.on("join-room", (room, socketId) => {
        var _a;
        const userSocket = io.sockets.sockets.get(socketId);
        if (!userSocket || !userSocket.data.user) {
            return;
        }
        const { name: id, key } = userSocket.data.user;
        (_a = chat.rooms.get(room)) === null || _a === void 0 ? void 0 : _a.system(`${id} entro a la sala`);
        userSocket.on(types_1.EClientEvent.CHAT, (matchId, message, callback) => {
            if (matchId !== room || !userSocket.data.user) {
                return;
            }
            const chatroom = chat.rooms.get(matchId);
            if (chatroom) {
                chatroom.send({ id, key }, message);
            }
            callback();
        });
    });
    adapter.on("leave-room", (room, socketId) => {
        var _a;
        const userSocket = io.sockets.sockets.get(socketId);
        if (!userSocket || !userSocket.data.user) {
            return;
        }
        const { name: id } = userSocket.data.user;
        (_a = chat.rooms.get(room)) === null || _a === void 0 ? void 0 : _a.system(`${id} salio de la sala`);
    });
    return chat;
};
exports.Chat = Chat;
