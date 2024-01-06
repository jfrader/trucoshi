import { ILobbyOptions, IPlayer, ITeam } from "../../types";
import { IGameLoop } from "./GameLoop";
import { ITable } from "./Table";
import { IQueue } from "./Queue";
export declare const DEFAULT_LOBBY_OPTIONS: ILobbyOptions;
export interface IPrivateLobby {
    options: ILobbyOptions;
    gameLoop?: IGameLoop;
    lastTeamIdx: 0 | 1;
    _players: Array<IPlayer | {
        id?: undefined;
        session?: undefined;
        teamIdx?: undefined;
    }>;
    get players(): Array<IPlayer>;
    teams: Array<ITeam>;
    table: ITable | null;
    queue: IQueue;
    full: boolean;
    ready: boolean;
    started: boolean;
    addPlayer(key: string, id: string, session: string, teamIdx?: 0 | 1, isOwner?: boolean): Promise<IPlayer>;
    removePlayer(session: string): ILobby;
    calculateReady(): boolean;
    calculateFull(): boolean;
    setOptions(options: Pick<Partial<ILobbyOptions>, "abandonTime" | "faltaEnvido" | "flor" | "handAckTime" | "matchPoint" | "turnTime">): void;
    isEmpty(): boolean;
    startMatch(matchPoint?: 9 | 12 | 15): IGameLoop;
}
export interface ILobby extends Pick<IPrivateLobby, "setOptions" | "addPlayer" | "removePlayer" | "startMatch" | "isEmpty" | "options" | "ready" | "full" | "started" | "teams" | "players" | "gameLoop" | "table" | "calculateReady"> {
}
export declare function Lobby(options?: Partial<ILobbyOptions>): ILobby;
