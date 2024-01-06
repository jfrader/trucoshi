"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GAME_ERROR = exports.TMap = exports.EClientEvent = exports.EServerEvent = exports.EHandState = exports.EEnvidoCommand = exports.EEnvidoAnswerCommand = exports.EAnswerCommand = exports.ETrucoCommand = exports.EFlorCommand = exports.ESayCommand = exports.EChatSystem = exports.EMatchState = exports.BURNT_CARD = exports.CARDS_HUMAN_READABLE = exports.CARDS = void 0;
const client_1 = require("@prisma/client");
Object.defineProperty(exports, "EMatchState", { enumerable: true, get: function () { return client_1.EMatchState; } });
var constants_1 = require("./lib/constants");
Object.defineProperty(exports, "CARDS", { enumerable: true, get: function () { return constants_1.CARDS; } });
Object.defineProperty(exports, "CARDS_HUMAN_READABLE", { enumerable: true, get: function () { return constants_1.CARDS_HUMAN_READABLE; } });
Object.defineProperty(exports, "BURNT_CARD", { enumerable: true, get: function () { return constants_1.BURNT_CARD; } });
var EChatSystem;
(function (EChatSystem) {
    EChatSystem[EChatSystem["TEAM_0"] = 0] = "TEAM_0";
    EChatSystem[EChatSystem["TEAM_1"] = 1] = "TEAM_1";
    EChatSystem["SYSTEM"] = "SYSTEM";
})(EChatSystem = exports.EChatSystem || (exports.EChatSystem = {}));
var ESayCommand;
(function (ESayCommand) {
    ESayCommand["MAZO"] = "MAZO";
})(ESayCommand = exports.ESayCommand || (exports.ESayCommand = {}));
var EFlorCommand;
(function (EFlorCommand) {
    EFlorCommand["FLOR"] = "FLOR";
    EFlorCommand["CONTRAFLOR"] = "CONTRAFLOR";
})(EFlorCommand = exports.EFlorCommand || (exports.EFlorCommand = {}));
var ETrucoCommand;
(function (ETrucoCommand) {
    ETrucoCommand["TRUCO"] = "TRUCO";
    ETrucoCommand["RE_TRUCO"] = "RE_TRUCO";
    ETrucoCommand["VALE_CUATRO"] = "VALE_CUATRO";
})(ETrucoCommand = exports.ETrucoCommand || (exports.ETrucoCommand = {}));
var EAnswerCommand;
(function (EAnswerCommand) {
    EAnswerCommand["QUIERO"] = "QUIERO";
    EAnswerCommand["NO_QUIERO"] = "NO_QUIERO";
})(EAnswerCommand = exports.EAnswerCommand || (exports.EAnswerCommand = {}));
var EEnvidoAnswerCommand;
(function (EEnvidoAnswerCommand) {
    EEnvidoAnswerCommand["SON_BUENAS"] = "SON_BUENAS";
})(EEnvidoAnswerCommand = exports.EEnvidoAnswerCommand || (exports.EEnvidoAnswerCommand = {}));
var EEnvidoCommand;
(function (EEnvidoCommand) {
    EEnvidoCommand["ENVIDO"] = "ENVIDO";
    EEnvidoCommand["REAL_ENVIDO"] = "REAL_ENVIDO";
    EEnvidoCommand["FALTA_ENVIDO"] = "FALTA_ENVIDO";
})(EEnvidoCommand = exports.EEnvidoCommand || (exports.EEnvidoCommand = {}));
var EHandState;
(function (EHandState) {
    EHandState["WAITING_PLAY"] = "WAITING_PLAY";
    EHandState["WAITING_FOR_TRUCO_ANSWER"] = "WAITING_FOR_TRUCO_ANSWER";
    EHandState["WAITING_ENVIDO_ANSWER"] = "WAITING_ENVIDO_ANSWER";
    EHandState["WAITING_ENVIDO_POINTS_ANSWER"] = "WAITING_ENVIDO_POINTS_ANSWER";
    EHandState["FINISHED"] = "FINISHED";
})(EHandState = exports.EHandState || (exports.EHandState = {}));
var EServerEvent;
(function (EServerEvent) {
    EServerEvent["PONG"] = "PONG";
    EServerEvent["SET_SESSION"] = "SET_SESSION";
    EServerEvent["PREVIOUS_HAND"] = "PREVIOUS_HAND";
    EServerEvent["UPDATE_MATCH"] = "UPDATE_MATCH";
    EServerEvent["WAITING_PLAY"] = "WAITING_PLAY";
    EServerEvent["UPDATE_ACTIVE_MATCHES"] = "UPDATE_ACTIVE_MATCHES";
    EServerEvent["PLAYER_USED_CARD"] = "PLAYER_USED_CARD";
    EServerEvent["PLAYER_SAID_COMMAND"] = "PLAYER_SAID_COMMAND";
    EServerEvent["WAITING_POSSIBLE_SAY"] = "WAITING_POSSIBLE_SAY";
    EServerEvent["UPDATE_CHAT"] = "UPDAET_CHAT";
})(EServerEvent = exports.EServerEvent || (exports.EServerEvent = {}));
var EClientEvent;
(function (EClientEvent) {
    EClientEvent["LOGIN"] = "LOGIN";
    EClientEvent["LOGOUT"] = "LOGOUT";
    EClientEvent["LEAVE_MATCH"] = "LEAVE_MATCH";
    EClientEvent["CREATE_MATCH"] = "CREATE_MATCH";
    EClientEvent["LIST_MATCHES"] = "LIST_MATCHES";
    EClientEvent["JOIN_MATCH"] = "JOIN_MATCH";
    EClientEvent["START_MATCH"] = "START_MATCH";
    EClientEvent["SET_PLAYER_READY"] = "SET_PLAYER_READY";
    EClientEvent["FETCH_MATCH"] = "FETCH_MATCH";
    EClientEvent["CHAT"] = "CHAT";
    EClientEvent["PING"] = "PING";
    EClientEvent["SAY"] = "SAY";
})(EClientEvent = exports.EClientEvent || (exports.EClientEvent = {}));
class TMap extends Map {
    find(finder) {
        let result = undefined;
        for (let value of this.values()) {
            const find = finder(value);
            if (!result && find) {
                result = value;
            }
        }
        return result;
    }
    findAll(finder) {
        return Array.from(this.values()).filter(finder);
    }
    getOrThrow(key) {
        const result = key && this.get(key);
        if (!result) {
            throw new Error(`getOrThrow(${key}) not found`);
        }
        return result;
    }
}
exports.TMap = TMap;
var GAME_ERROR;
(function (GAME_ERROR) {
    GAME_ERROR["MATCH_ALREADY_STARTED"] = "MATCH_ALREADY_STARTED";
    GAME_ERROR["LOBBY_IS_FULL"] = "LOBBY_IS_FULL";
    GAME_ERROR["UNEXPECTED_TEAM_SIZE"] = "UNEXPECTED_TEAM_SIZE";
    GAME_ERROR["TEAM_NOT_READY"] = "TEAM_NOT_READY";
    GAME_ERROR["TEAM_IS_FULL"] = "TEAM_IS_FULL";
    GAME_ERROR["INVALID_ENVIDO_POINTS"] = "INVALID_ENVIDO_POINTS";
    GAME_ERROR["ENVIDO_NOT_ACCEPTED"] = "ENVIDO_NOT_ACCEPTED";
    GAME_ERROR["INVALID_COMAND"] = "INVALID_COMAND";
})(GAME_ERROR = exports.GAME_ERROR || (exports.GAME_ERROR = {}));
