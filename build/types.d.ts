import { User } from "lightning-accounts";
import { CARDS, IHand } from "./lib";
import { IUserData } from "./server";
import { EMatchState } from "@prisma/client";
export { CARDS, CARDS_HUMAN_READABLE, BURNT_CARD } from "./lib/constants";
export { EMatchState };
export interface ILobbyOptions {
    maxPlayers: 2 | 4 | 6;
    faltaEnvido: 1 | 2;
    flor: boolean;
    matchPoint: number;
    handAckTime: number;
    turnTime: number;
    abandonTime: number;
    satsPerPlayer: number;
}
export interface ISaidCommand {
    player: IPlayer | IPublicPlayer;
    command: ECommand | number;
}
export interface IMatchPreviousHand {
    rounds: IPlayedCard[][];
    points: IHandPoints;
    matchSessionId: string;
}
export interface IPublicMatch {
    options: ILobbyOptions;
    state: EMatchState;
    winner: ITeam | null;
    matchSessionId: string;
    teams: Array<IPublicTeam>;
    players: Array<IPublicPlayer>;
    me: IPublicPlayer | null;
    freshHand: boolean;
    rounds: IPlayedCard[][];
    lastCard?: ICard | null;
    lastCommand?: ECommand | number | null;
}
export interface IPublicMatchInfo {
    ownerId: string;
    matchSessionId: string;
    players: number;
    options: ILobbyOptions;
    state: EMatchState;
}
export type IPublicChatRoom = Pick<IChatRoom, "id" | "messages">;
export interface IChatMessage {
    id: string;
    date: number;
    user: {
        id: string;
        key: string;
    };
    system?: boolean;
    command?: boolean;
    card?: boolean;
    content: string;
}
export interface IChatRoom {
    id: string;
    messages: Array<IChatMessage>;
    socket: {
        emit(socket: string): void;
    };
    send(user: IChatMessage["user"], message: string): void;
    card(user: IChatMessage["user"], card: ICard): void;
    command(team: 0 | 1, command: ECommand | number): void;
    system(message: string): void;
    emit(message?: IChatMessage): void;
}
export declare enum EChatSystem {
    TEAM_0 = 0,
    TEAM_1 = 1,
    SYSTEM = "SYSTEM"
}
export declare enum ESayCommand {
    MAZO = "MAZO"
}
export declare enum EFlorCommand {
    FLOR = "FLOR",
    CONTRAFLOR = "CONTRAFLOR"
}
export declare enum ETrucoCommand {
    TRUCO = "TRUCO",
    RE_TRUCO = "RE_TRUCO",
    VALE_CUATRO = "VALE_CUATRO"
}
export declare enum EAnswerCommand {
    QUIERO = "QUIERO",
    NO_QUIERO = "NO_QUIERO"
}
export declare enum EEnvidoAnswerCommand {
    SON_BUENAS = "SON_BUENAS"
}
export declare enum EEnvidoCommand {
    ENVIDO = "ENVIDO",
    REAL_ENVIDO = "REAL_ENVIDO",
    FALTA_ENVIDO = "FALTA_ENVIDO"
}
export declare enum EHandState {
    WAITING_PLAY = "WAITING_PLAY",
    WAITING_FOR_TRUCO_ANSWER = "WAITING_FOR_TRUCO_ANSWER",
    WAITING_ENVIDO_ANSWER = "WAITING_ENVIDO_ANSWER",
    WAITING_ENVIDO_POINTS_ANSWER = "WAITING_ENVIDO_POINTS_ANSWER",
    FINISHED = "FINISHED"
}
export type ECommand = ESayCommand | EEnvidoCommand | EAnswerCommand | EEnvidoAnswerCommand | ETrucoCommand | EFlorCommand;
export type IHandCommands = {
    [key in ECommand]: (hand: IHand, player: IPlayer) => void;
};
export declare enum EServerEvent {
    PONG = "PONG",
    SET_SESSION = "SET_SESSION",
    PREVIOUS_HAND = "PREVIOUS_HAND",
    UPDATE_MATCH = "UPDATE_MATCH",
    WAITING_PLAY = "WAITING_PLAY",
    UPDATE_ACTIVE_MATCHES = "UPDATE_ACTIVE_MATCHES",
    PLAYER_USED_CARD = "PLAYER_USED_CARD",
    PLAYER_SAID_COMMAND = "PLAYER_SAID_COMMAND",
    WAITING_POSSIBLE_SAY = "WAITING_POSSIBLE_SAY",
    UPDATE_CHAT = "UPDAET_CHAT"
}
export declare enum EClientEvent {
    LOGIN = "LOGIN",
    LOGOUT = "LOGOUT",
    LEAVE_MATCH = "LEAVE_MATCH",
    CREATE_MATCH = "CREATE_MATCH",
    LIST_MATCHES = "LIST_MATCHES",
    JOIN_MATCH = "JOIN_MATCH",
    START_MATCH = "START_MATCH",
    SET_PLAYER_READY = "SET_PLAYER_READY",
    FETCH_MATCH = "FETCH_MATCH",
    CHAT = "CHAT",
    PING = "PING",
    SAY = "SAY"
}
export type IEventCallback<T = {}> = (args: {
    success: boolean;
} & T) => void;
export interface ServerToClientEvents {
    [EServerEvent.PONG]: (serverTime: number, clientTime: number) => void;
    [EServerEvent.SET_SESSION]: (userData: IUserData, serverVersion: string, activeMatches: Array<IPublicMatchInfo>) => void;
    [EServerEvent.WAITING_POSSIBLE_SAY]: (match: IPublicMatch, callback: (data: IWaitingSayData) => void) => void;
    [EServerEvent.PREVIOUS_HAND]: (value: IMatchPreviousHand, callback: () => void) => void;
    [EServerEvent.UPDATE_CHAT]: (room: IPublicChatRoom, message?: IChatMessage) => void;
    [EServerEvent.UPDATE_ACTIVE_MATCHES]: (activeMatches: IPublicMatchInfo[]) => void;
    [EServerEvent.UPDATE_MATCH]: (match: IPublicMatch, callback?: () => void) => void;
    [EServerEvent.PLAYER_USED_CARD]: (match: IPublicMatch, card: IPlayedCard) => void;
    [EServerEvent.PLAYER_SAID_COMMAND]: (match: IPublicMatch, command: ISaidCommand) => void;
    [EServerEvent.WAITING_PLAY]: (match: IPublicMatch, callback: (data: IWaitingPlayData) => void) => void;
}
export interface ClientToServerEvents {
    [EClientEvent.LOGIN]: (user: User, identityToken: string, callback: IEventCallback<{}>) => void;
    [EClientEvent.LOGOUT]: (callback: IEventCallback<{}>) => void;
    [EClientEvent.PING]: (clientTime: number) => void;
    [EClientEvent.CHAT]: (matchId: string, msg: string, callback: () => void) => void;
    [EClientEvent.LEAVE_MATCH]: (matchId: string) => void;
    [EClientEvent.CREATE_MATCH]: (callback: IEventCallback<{
        match?: IPublicMatch;
        activeMatches?: IPublicMatchInfo[];
    }>) => void;
    [EClientEvent.START_MATCH]: (matchId: string, callback: IEventCallback<{
        matchSessionId?: string;
    }>) => void;
    [EClientEvent.FETCH_MATCH]: (matchId: string, callback: IEventCallback<{
        match: IPublicMatch | null;
    }>) => void;
    [EClientEvent.LIST_MATCHES]: (filters: {
        state?: Array<EMatchState>;
    }, callback: IEventCallback<{
        matches: Array<IPublicMatchInfo>;
    }>) => void;
    [EClientEvent.SET_PLAYER_READY]: (matchSessionId: string, ready: boolean, callback: IEventCallback<{
        match?: IPublicMatch;
    }>) => void;
    [EClientEvent.JOIN_MATCH]: (matchSessionId: string, teamIdx: 0 | 1 | undefined, callback: IEventCallback<{
        match?: IPublicMatch;
        activeMatches?: IPublicMatchInfo[];
    }>) => void;
}
export type IWaitingPlayData = {
    cardIdx: number;
    card: ICard;
};
export type IWaitingPlayCallback = (data: IWaitingPlayData) => void | null;
export type IWaitingSayData = {
    command: ECommand | number;
};
export type IWaitingSayCallback = (data: IWaitingSayData) => void | null;
export declare class TMap<K, V> extends Map<K, V> {
    find(finder: (value: V) => boolean): V | void;
    findAll(finder: (value: V) => boolean): V[];
    getOrThrow(key?: K): NonNullable<V>;
}
export declare enum GAME_ERROR {
    MATCH_ALREADY_STARTED = "MATCH_ALREADY_STARTED",
    LOBBY_IS_FULL = "LOBBY_IS_FULL",
    UNEXPECTED_TEAM_SIZE = "UNEXPECTED_TEAM_SIZE",
    TEAM_NOT_READY = "TEAM_NOT_READY",
    TEAM_IS_FULL = "TEAM_IS_FULL",
    INVALID_ENVIDO_POINTS = "INVALID_ENVIDO_POINTS",
    ENVIDO_NOT_ACCEPTED = "ENVIDO_NOT_ACCEPTED",
    INVALID_COMAND = "INVALID_COMAND"
}
export interface EnvidoState {
    accept: number;
    decline: number;
    teamIdx: 0 | 1 | null;
}
export type IEnvidoCalculatorResult = {
    accept: number;
    decline: number;
    replace?: number;
    next: Array<ECommand>;
};
export type IFaltaEnvidoCalculatorArgs = {
    teams: [ITeam, ITeam];
    options: ILobbyOptions;
};
export type IEnvidoCalculatorArgs = {
    stake: number;
    declineStake: number;
} & (IFaltaEnvidoCalculatorArgs | never);
export type IEnvidoCalculator = {
    [key in EEnvidoCommand]: (args?: IEnvidoCalculatorArgs) => IEnvidoCalculatorResult;
};
export interface IDeck {
    cards: Array<ICard>;
    usedCards: Array<ICard>;
    takeCard(): ICard;
    takeThree(): [ICard, ICard, ICard];
    shuffle(): IDeck;
}
export type ICard = keyof typeof CARDS;
export interface IPlayedCard {
    key: string;
    player: IPlayer | IPublicPlayer;
    card: ICard;
}
export interface IHandPoints {
    0: number;
    1: number;
}
export type IPublicPlayer = Pick<IPlayer, "id" | "key" | "disabled" | "abandoned" | "ready" | "hand" | "usedHand" | "prevHand" | "teamIdx" | "isTurn" | "turnExpiresAt" | "turnExtensionExpiresAt" | "isEnvidoTurn" | "isOwner"> & ({
    isMe?: true;
    commands: IPlayer["commands"];
    hasFlor: IPlayer["hasFlor"];
    envido: IPlayer["envido"];
} | {
    isMe?: false;
    commands?: undefined;
    hasFlor?: undefined;
    envido?: undefined;
});
export type IPublicTeam = Pick<ITeam, "points" | "id" | "name"> & {
    players: Array<IPublicPlayer>;
};
export interface IPlayer {
    teamIdx: number;
    id: string;
    key: string;
    session: string;
    hand: Array<ICard>;
    envido: Array<number>;
    _commands: Set<ECommand>;
    get commands(): Array<ECommand>;
    usedHand: Array<ICard>;
    prevHand: Array<ICard>;
    isTurn: boolean;
    turnExpiresAt: number | null;
    turnExtensionExpiresAt: number | null;
    hasFlor: boolean;
    isEnvidoTurn: boolean;
    isOwner: boolean;
    disabled: boolean;
    abandoned: boolean;
    ready: boolean;
    resetCommands(): void;
    calculateEnvido(): Array<number>;
    setTurn(turn: boolean): void;
    setTurnExpiration(...args: [number, number | null] | [null, null]): void;
    setEnvidoTurn(turn: boolean): void;
    getPublicPlayer(session?: string): IPublicPlayer;
    setSession(session: string): void;
    setIsOwner(isOwner: boolean): void;
    enable(): void;
    disable(): void;
    abandon(): void;
    setReady(ready: boolean): void;
    setHand(hand: Array<ICard>): Array<ICard>;
    useCard(idx: number, card: ICard): ICard | null;
}
export interface ITeam {
    _players: Map<string, IPlayer>;
    id: 0 | 1;
    name: string;
    players: Array<IPlayer>;
    points: ITeamPoints;
    pointsToWin(matchPoint: number): number;
    getPublicTeam(playerSession?: string): IPublicTeam;
    isTeamDisabled(): boolean;
    disable(player: IPlayer): boolean;
    enable(player?: IPlayer): boolean;
    addPoints(matchPoint: number, points: number, simulate?: boolean): ITeamPoints;
}
export interface ITeamPoints {
    buenas: number;
    malas: number;
    winner: boolean;
}
export type IPublicUser = Pick<User, "id" | "email" | "name" | "role">;
