/// <reference types="node" />
import { User } from "lightning-accounts";
export interface IUserData {
    key: string;
    name: string;
    session: string;
    account: User | null;
}
export interface IUserSession extends IUserData {
    _name: string;
    online: boolean;
    ownedMatches: Set<string>;
    reconnectTimeouts: Map<string, NodeJS.Timeout | null>;
    reconnectPromises: Map<string, () => void>;
    setAccount(user: User | null): void;
    getPublicInfo(): Omit<IUserSession, "session" | "user">;
    waitReconnection(room: string, timeout: number): Promise<void>;
    resolveWaitingPromises(room: string): void;
    connect(): void;
    disconnect(): void;
    reconnect(room: string): void;
    setName(id: string): void;
    getUserData(): IUserData;
}
export interface ISocketMatchState {
    isWaitingForPlay: boolean;
    isWaitingForSay: boolean;
}
export declare function UserSession(key: string, username: string, session: string): IUserSession;
