import { IPlayedCard, IPlayer } from "../../types";
export interface ITable {
    forehandIdx: number;
    cards: Array<Array<IPlayedCard>>;
    players: Array<IPlayer>;
    nextHand(): IPlayer;
    getPlayerByPosition(idx?: number, forehandFirst?: boolean): IPlayer;
    getPlayerPosition(key: string, forehandFirst?: boolean): number;
    getPlayersForehandFirst(forehandIdx?: number): Array<IPlayer>;
}
export declare function Table(players: Array<IPlayer>): ITable;
