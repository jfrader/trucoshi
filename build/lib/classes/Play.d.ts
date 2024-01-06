import { ECommand, EHandState, ICard, IPlayer, ITeam } from "../../types";
import { IEnvido } from "./Envido";
import { IHand } from "./Hand";
import { IRound } from "./Round";
import { ITruco } from "./Truco";
export interface IPlayInstance {
    teams: [ITeam, ITeam];
    handIdx: number;
    roundIdx: number;
    state: EHandState;
    truco: ITruco;
    envido: IEnvido;
    player: IPlayer | null;
    rounds: Array<IRound> | null;
    prevHand: IHand | null;
    freshHand: boolean;
    waitingPlay: boolean;
    lastCommand: ECommand | number | null;
    lastCard: ICard | null;
    setWaiting(waiting: boolean): void;
    use(idx: number, card: ICard): ICard | null;
    say(command: ECommand | number, player: IPlayer): typeof command | null;
}
export declare function PlayInstance(hand: IHand, prevHand: IHand | null, teams: [ITeam, ITeam]): IPlayInstance;
