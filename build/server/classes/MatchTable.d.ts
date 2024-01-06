import { EMatchState } from "@prisma/client";
import { IHand, ILobby } from "../../lib";
import { ILobbyOptions, IMatchPreviousHand, IPlayedCard, IPlayer, IPublicMatch, IPublicMatchInfo } from "../../types";
export interface IMatchTable {
    ownerSession: string;
    matchSessionId: string;
    lobby: ILobby;
    state(): EMatchState;
    isSessionPlaying(session: string): IPlayer | null;
    getPreviousHand(hand: IHand): IMatchPreviousHand;
    getHandRounds(hand: IHand): IPlayedCard[][];
    getPublicMatch(session?: string, freshHand?: boolean): IPublicMatch;
    getPublicMatchInfo(): IPublicMatchInfo;
    playerDisconnected(player: IPlayer): void;
    playerReconnected(player: IPlayer): void;
    playerAbandoned(player: IPlayer): void;
}
export declare function MatchTable(matchSessionId: string, ownerSession: string, options?: Partial<ILobbyOptions>): IMatchTable;
