import { ICard } from "../types";
import { IRound } from "./classes";
export declare function getMaxNumberIndex<T = number>(array: Array<T>): number;
export declare function getCardValue(card: ICard): number;
export declare function shuffleArray<T = unknown>(array: Array<T>): T[];
export declare function checkHandWinner(rounds: Array<IRound>, forehandTeamIdx: 0 | 1): null | 0 | 1;
