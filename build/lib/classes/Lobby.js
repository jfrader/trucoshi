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
exports.Lobby = exports.DEFAULT_LOBBY_OPTIONS = void 0;
const constants_1 = require("../constants");
const types_1 = require("../../types");
const GameLoop_1 = require("./GameLoop");
const Match_1 = require("./Match");
const Player_1 = require("./Player");
const Table_1 = require("./Table");
const Team_1 = require("./Team");
const Queue_1 = require("./Queue");
const logger_1 = __importDefault(require("../../utils/logger"));
exports.DEFAULT_LOBBY_OPTIONS = {
    faltaEnvido: 2,
    flor: false,
    matchPoint: 9,
    maxPlayers: 6,
    handAckTime: constants_1.PREVIOUS_HAND_ACK_TIMEOUT,
    turnTime: process.env.NODE_DISABLE_TURN_TIMER ? 99999 * 1000 : constants_1.PLAYER_TURN_TIMEOUT,
    abandonTime: constants_1.PLAYER_ABANDON_TIMEOUT,
    satsPerPlayer: 0,
};
function Lobby(options = {}) {
    const lobby = {
        options: Object.assign(structuredClone(exports.DEFAULT_LOBBY_OPTIONS), options),
        lastTeamIdx: 1,
        _players: [],
        get players() {
            return lobby._players.filter((player) => Boolean(player && player.id));
        },
        teams: [],
        queue: (0, Queue_1.Queue)(),
        table: null,
        full: false,
        ready: false,
        started: false,
        gameLoop: undefined,
        setOptions(value) {
            lobby.options = Object.assign(Object.assign({}, lobby.options), value);
        },
        isEmpty() {
            return !lobby.players.length;
        },
        calculateReady() {
            return calculateLobbyReadyness(lobby);
        },
        calculateFull() {
            return calculateLobbyFullness(lobby);
        },
        addPlayer(key, id, session, teamIdx, isOwner) {
            return __awaiter(this, void 0, void 0, function* () {
                let player = null;
                yield lobby.queue.queue(() => {
                    try {
                        player = addPlayerToLobby({
                            lobby,
                            id,
                            session,
                            key,
                            isOwner,
                            teamIdx,
                            teamSize: lobby.options.maxPlayers / 2,
                        });
                    }
                    catch (e) {
                        logger_1.default.error(e, "Error adding player to match");
                    }
                });
                if (player) {
                    logger_1.default.trace({ player: player.id }, "Adding player to match table lobby");
                    return player;
                }
                throw new Error("Couldn't add player to match");
            });
        },
        removePlayer(session) {
            const idx = lobby._players.findIndex((player) => player && player.session === session);
            if (idx !== -1) {
                lobby._players[idx] = {};
                lobby.calculateFull();
                lobby.calculateReady();
            }
            return lobby;
        },
        startMatch() {
            return startLobbyMatch(lobby);
        },
    };
    for (let i = 0; i < lobby.options.maxPlayers; i++) {
        lobby._players.push({});
    }
    return lobby;
}
exports.Lobby = Lobby;
const startLobbyMatch = (lobby) => {
    lobby.calculateReady();
    const actualTeamSize = lobby.players.length / 2;
    if (!constants_1.TEAM_SIZE_VALUES.includes(actualTeamSize)) {
        throw new Error(types_1.GAME_ERROR.UNEXPECTED_TEAM_SIZE);
    }
    if (!lobby.ready) {
        throw new Error(types_1.GAME_ERROR.TEAM_NOT_READY);
    }
    lobby.teams = [
        (0, Team_1.Team)(0, lobby.players.filter((player) => player.teamIdx === 0)),
        (0, Team_1.Team)(1, lobby.players.filter((player) => player.teamIdx === 1)),
    ];
    if (lobby.teams[0].players.length !== actualTeamSize ||
        lobby.teams[1].players.length !== actualTeamSize) {
        throw new Error(types_1.GAME_ERROR.UNEXPECTED_TEAM_SIZE);
    }
    lobby.table = (0, Table_1.Table)(lobby.players);
    lobby.gameLoop = (0, GameLoop_1.GameLoop)((0, Match_1.Match)(lobby.table, lobby.teams, lobby.options));
    lobby.started = true;
    return lobby.gameLoop;
};
const calculateLobbyFullness = (lobby) => {
    lobby.full = lobby.players.length >= lobby.options.maxPlayers;
    return lobby.full;
};
const calculateLobbyReadyness = (lobby) => {
    const allPlayersReady = lobby.players.reduce((prev, curr) => Boolean(prev && curr && curr.ready), true);
    const teamsSameSize = lobby.players.filter((player) => player.teamIdx === 0).length ===
        lobby.players.filter((player) => player.teamIdx === 1).length;
    const allTeamsComplete = lobby.players.length % 2 === 0;
    lobby.ready = allPlayersReady && allTeamsComplete && teamsSameSize;
    return lobby.ready;
};
const addPlayerToLobby = ({ lobby, id, session, key, teamIdx, isOwner, teamSize, }) => {
    const playerParams = { id, key, teamIdx, isOwner };
    logger_1.default.trace(playerParams, "Adding player to match started");
    const exists = lobby.players.find((player) => player.session === session);
    const hasMovedSlots = Boolean(exists);
    if (exists) {
        if (exists.teamIdx === teamIdx) {
            logger_1.default.trace(playerParams, "Adding player to match: Player already exists on the same team");
            return exists;
        }
        isOwner = exists.isOwner;
        logger_1.default.trace(playerParams, "Adding player to match: Player already exists on a different team, removing player");
        lobby.removePlayer(exists.session);
    }
    if (lobby.started) {
        logger_1.default.trace(playerParams, "Adding player to match: Match already started! Cannot add player");
        throw new Error(types_1.GAME_ERROR.MATCH_ALREADY_STARTED);
    }
    if (lobby.full) {
        logger_1.default.trace(playerParams, "Adding player to match: Lobby is full. Cannot add player");
        throw new Error(types_1.GAME_ERROR.LOBBY_IS_FULL);
    }
    if (lobby.full ||
        lobby.players.filter((player) => player.teamIdx === teamIdx).length > teamSize) {
        logger_1.default.trace(playerParams, "Adding player to match: Team is full. Cannot add player");
        throw new Error(types_1.GAME_ERROR.TEAM_IS_FULL);
    }
    const player = (0, Player_1.Player)(key, id, teamIdx !== undefined ? teamIdx : Number(!lobby.lastTeamIdx), isOwner);
    player.setSession(session);
    lobby.lastTeamIdx = player.teamIdx;
    // Find team available slot
    for (let i = 0; i < lobby._players.length; i++) {
        if (!lobby._players[i].id) {
            if (player.teamIdx === 0 && i % 2 === 0) {
                lobby._players[i] = player;
                break;
            }
            if (player.teamIdx === 1 && i % 2 !== 0) {
                lobby._players[i] = player;
                break;
            }
        }
    }
    if (hasMovedSlots) {
        // Reorder other players to fit possible empty slot left by this player
        for (let i = 0; i < lobby._players.length; i++) {
            if (!lobby._players[i].id) {
                for (let j = i + 2; j < lobby._players.length; j = j + 2) {
                    if (lobby._players[j].id) {
                        const p = Object.assign({}, lobby._players[j]);
                        lobby._players[j] = {};
                        lobby._players[i] = p;
                        break;
                    }
                }
            }
        }
    }
    lobby.calculateFull();
    lobby.calculateReady();
    logger_1.default.trace({ playerParams, player: player.getPublicPlayer() }, "Added player to match");
    return player;
};
