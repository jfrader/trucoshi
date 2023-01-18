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
}

export type IGetNextTurnResult = { currentPlayer?: IPlayer, currentRound?: IRound, winner?: ITeam }

export interface IMatch {
    teams: [ITeam, ITeam]
    hands: Array<IHand>
    winner: ITeam | null
    currentPlayer: IPlayer | null
    table: ITable
    turn: number
    getCurrentHand(): IHand | null
    incrementTableTurn(): IMatch
    getNextTurn(): IteratorResult<IGetNextTurnResult, IGetNextTurnResult | void>
}

export type IPoints = { 0: number, 1: number }

export type IGetNextPlayerResult = { currentPlayer?: IPlayer, currentRound?: IRound, points?: IPoints }

export interface IHand {
    turn: number
    winner: boolean
    points: IPoints
    rounds: Array<IRound>
    currentPlayer: IPlayer | null
    currentRound: IRound | null
    getCurrentRound(): IRound | null
    getNextPlayer(): IteratorResult<IGetNextPlayerResult, IGetNextPlayerResult | void>
}

export type ITable = Array<IPlayer>

export interface IRound {
    tie: boolean,
    winner: IPlayer | null
    highest: number
    cards: Array<IPlayedCard>
    play(playedCard: IPlayedCard): IRound
}
