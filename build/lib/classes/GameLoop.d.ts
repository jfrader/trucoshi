import { ECommand, ICard, IPlayer, ITeam } from "../../types";
import { IHand } from "./Hand";
import { IMatch } from "./Match";
import { IPlayInstance } from "./Play";
export type IWinnerCallback = (winner: ITeam, teams: [ITeam, ITeam]) => Promise<void>;
export type ITurnCallback = (play: IPlayInstance) => Promise<void>;
export type ITrucoCallback = (play: IPlayInstance) => Promise<void>;
export type IHandFinishedCallback = (hand: IHand | null) => Promise<void>;
export type IEnvidoCallback = (play: IPlayInstance, pointsRound: boolean) => Promise<void>;
export interface IGameLoop {
    _onTruco: ITrucoCallback;
    _onTurn: ITurnCallback;
    _onWinner: IWinnerCallback;
    _onEnvido: IEnvidoCallback;
    _onHandFinished: IHandFinishedCallback;
    currentPlayer: IPlayer | null;
    currentHand: IHand | null;
    lastCommand: ECommand | number | null;
    lastCard: ICard | null;
    teams: Array<ITeam>;
    winner: ITeam | null;
    onTurn: (callback: ITurnCallback) => IGameLoop;
    onWinner: (callback: IWinnerCallback) => IGameLoop;
    onTruco: (callback: ITrucoCallback) => IGameLoop;
    onEnvido: (callback: IEnvidoCallback) => IGameLoop;
    onHandFinished: (callback: IHandFinishedCallback) => IGameLoop;
    begin: () => Promise<void>;
}
export declare const GameLoop: (match: IMatch) => IGameLoop;
