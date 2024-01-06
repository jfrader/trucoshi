import { IDeck, IHandPoints, ILobbyOptions, ITeam } from "../../types";
import { IHand } from "./Hand";
import { IPlayInstance } from "./Play";
import { ITable } from "./Table";
export interface IMatch {
    readonly options: ILobbyOptions;
    teams: [ITeam, ITeam];
    hands: Array<IHand>;
    winner: ITeam | null;
    prevHand: IHand | null;
    currentHand: IHand | null;
    deck: IDeck;
    table: ITable;
    play(): IPlayInstance | null;
    addPoints(points: IHandPoints): [ITeam, ITeam];
    pushHand(hand: IHand): void;
    setPrevHand(hand: IHand | null): IHand | null;
    setCurrentHand(hand: IHand | null): IHand | null;
    setWinner(winner: ITeam): void;
    getNextTurn(): IteratorResult<IMatch | null, IMatch | null | void>;
}
export declare function Match(table: ITable, teams: ITeam[] | undefined, options: ILobbyOptions): IMatch;
