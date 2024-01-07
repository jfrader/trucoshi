/// <reference types="node" />
/// <reference types="node" />
import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { IHand, IPlayInstance } from "../../lib";
import { ClientToServerEvents, ECommand, ICard, IEventCallback, IPlayer, IPublicMatch, IPublicMatchInfo, IPublicPlayer, ITeam, ServerToClientEvents, TMap } from "../../types";
import { IChat } from "./Chat";
import { IMatchTable } from "./MatchTable";
import { IUserSession, ISocketMatchState, IUserData } from "./UserSession";
import { IStore } from "../../store/classes/Store";
import { User } from "lightning-accounts";
import { EMatchState } from "@prisma/client";
interface ITrucoshiTurn {
    play: IPlayInstance;
    timeout: NodeJS.Timeout;
    resolve(): void;
}
interface MatchTableMap extends TMap<string, IMatchTable> {
    getAll(filters: {
        state?: Array<EMatchState>;
    }): Array<IPublicMatchInfo>;
}
declare class MatchTableMap extends TMap<string, IMatchTable> {
}
interface InterServerEvents {
}
interface SocketData {
    user?: IUserData;
    matches: TMap<string, ISocketMatchState>;
}
export type TrucoshiServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export type TrucoshiSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
export interface ITrucoshi {
    io: TrucoshiServer;
    httpServer: HttpServer;
    store: IStore;
    chat: IChat;
    tables: MatchTableMap;
    sessions: TMap<string, IUserSession>;
    turns: TMap<string, ITrucoshiTurn>;
    createUserSession(socket: TrucoshiSocket, username?: string, token?: string): IUserSession;
    getTableSockets(table: IMatchTable, callback?: (playerSocket: TrucoshiSocket, player: IPlayer | null) => Promise<void>): Promise<{
        sockets: any[];
        players: IPublicPlayer[];
        spectators: any[];
    }>;
    getSessionActiveMatches(session?: string): IPublicMatchInfo[];
    login(socket: TrucoshiSocket, account: User, identityJwt: string, callback: IEventCallback<{}>): Promise<void>;
    logout(socket: TrucoshiSocket, callback: IEventCallback<{}>): void;
    emitSocketSession(socket: TrucoshiSocket): Promise<void>;
    leaveMatch(matchId: string, socketId: string): Promise<void>;
    emitWaitingPossibleSay(play: IPlayInstance, table: IMatchTable, freshHand?: boolean): Promise<ECommand | number>;
    emitWaitingForPlay(play: IPlayInstance, table: IMatchTable, freshHand?: boolean): Promise<"say" | "play">;
    emitMatchUpdate(table: IMatchTable, skipSocketIds?: Array<string>): Promise<void>;
    emitPreviousHand(hand: IHand, table: IMatchTable): Promise<void>;
    emitSocketMatch(socket: TrucoshiSocket, currentMatchId: string | null): IPublicMatch | null;
    playCard(table: IMatchTable, play: IPlayInstance, player: IPlayer, cardIdx: number, card: ICard): Promise<void>;
    sayCommand(table: IMatchTable, play: IPlayInstance, player: IPlayer, command: ECommand | number): Promise<ECommand | number>;
    startMatch(matchSessionId: string): Promise<void>;
    setTurnTimeout(table: IMatchTable, player: IPlayer, user: IUserSession, retry: () => void, cancel: () => void): NodeJS.Timeout;
    onHandFinished(table: IMatchTable, hand: IHand | null): Promise<void>;
    onTurn(table: IMatchTable, play: IPlayInstance): Promise<void>;
    onTruco(table: IMatchTable, play: IPlayInstance): Promise<void>;
    onEnvido(table: IMatchTable, play: IPlayInstance, isPointsRounds: boolean): Promise<void>;
    onWinner(table: IMatchTable, winner: ITeam): Promise<void>;
    removePlayerAndCleanup(table: IMatchTable, player: IPlayer): void;
    cleanupMatchTable(table: IMatchTable): void;
    resetSocketsMatchState(table: IMatchTable): Promise<void>;
    listen: (callback: (io: TrucoshiServer) => void) => void;
}
export declare const Trucoshi: ({ port, origin, serverVersion, }: {
    port: number;
    origin?: string | string[] | undefined;
    serverVersion: string;
}) => ITrucoshi;
export {};
