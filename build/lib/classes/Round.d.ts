import { ICard, IPlayedCard, IPlayer } from "../../types";
export interface IRound {
    tie: boolean;
    winner: IPlayer | null;
    highest: number;
    cards: Array<IPlayedCard>;
    turn: number;
    nextTurn(): void;
    use(playedCard: IPlayedCard): ICard;
}
export interface IRoundPoints {
    0: number;
    1: number;
    ties: number;
}
export declare function Round(): IRound;
