import { CARDS } from "./constants"

export type ICard = keyof typeof CARDS

export interface IPlayedCard {
    player: IPlayer
    card: ICard
}

export interface IPlayer {
    teamIdx: number
    id: string
    hand: Array<ICard>,
    usedHand: Array<ICard>
    setHand(hand: Array<ICard>): Array<ICard>
    useCard(card: string): ICard | null
}

export interface ITeam {
    color: string
    _players: Map<string, IPlayer>
    players: Array<IPlayer>
    points: number
    addPoints(points: number): number
}

export type IGetNextTurnResult = { currentPlayer?: IPlayer, currentRound?: IRound, winner?: ITeam }

export interface IMatch {
    teams: [ITeam, ITeam]
    hands: Array<IHand>
    winner: ITeam | null
    currentHand: IHand | null
    table: ITable
    turn: number
    addPoints(points: IPoints): void
    pushHand(hand: IHand): void
    setCurrentHand(hand: IHand | null): IHand | null
    setWinner(winner: ITeam): void
    incrementTableTurn(): IMatch
    getNextTurn(): IteratorResult<IMatch | null, IMatch | null | void>
}

export type IPoints = {
    0: number // team 0
    1: number // team 1
    2: number // ties
}

export type IGetNextPlayerResult = { currentPlayer?: IPlayer, currentRound?: IRound, points?: IPoints }

export interface IHand {
    idx: number
    turn: number
    winner: boolean
    points: IPoints
    rounds: Array<IRound>
    currentPlayer: IPlayer | null
    currentRound: IRound | null
    getNextPlayer(): IteratorResult<IHand, IHand | void>
}

export type ITable = Array<IPlayer>

export interface IRound {
    tie: boolean,
    winner: IPlayer | null
    highest: number
    cards: Array<IPlayedCard>
    play(playedCard: IPlayedCard): IRound
}
