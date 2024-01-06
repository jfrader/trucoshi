import { ECommand, ETrucoCommand, IPlayer, ITeam } from "../../types";
interface IPlayerCurrentCommands {
    player: IPlayer;
    add: Array<ECommand>;
    del: Array<ECommand>;
}
export interface ITruco {
    state: 1 | 2 | 3 | 4;
    teamIdx: 0 | 1 | null;
    waitingAnswer: boolean;
    answer: boolean | null;
    turn: number;
    teams: [ITeam, ITeam];
    players: Array<IPlayer>;
    currentCommands: Array<IPlayerCurrentCommands>;
    currentPlayer: IPlayer | null;
    sayTruco(player: IPlayer): ITruco;
    sayAnswer(player: IPlayer, answer: boolean | null): ITruco;
    setTurn(turn: number): number;
    setTeam(idx: 0 | 1): 0 | 1;
    getNextTrucoCommand(): ETrucoCommand | null;
    setCurrentPlayer(player: IPlayer | null): IPlayer | null;
    getNextPlayer(): IteratorResult<ITruco, ITruco | void>;
    reset(): void;
}
export declare function Truco(teams: [ITeam, ITeam]): ITruco;
export {};
