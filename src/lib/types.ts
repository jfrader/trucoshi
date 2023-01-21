import { CARDS } from "./constants"

export type ICard = keyof typeof CARDS

export interface IDeck {
  cards: Array<ICard>
  usedCards: Array<ICard>
  takeCard(): ICard
  shuffle(): IDeck
}

export interface IPlayedCard {
  player: IPlayer
  card: ICard
}

export interface IPlayer {
  teamIdx: number
  id: string
  hand: Array<ICard>
  usedHand: Array<ICard>
  setHand(hand: Array<ICard>): Array<ICard>
  useCard(idx: number): ICard | null
}

export interface ITeam {
  color: string
  _players: Map<string, IPlayer>
  players: Array<IPlayer>
  points: number
  addPoints(points: number): number
}

export interface IMatch {
  teams: [ITeam, ITeam]
  hands: Array<IHand>
  winner: ITeam | null
  currentHand: IHand | null
  table: ITable
  play(): IPlayInstance | undefined
  addPoints(points: IPoints): void
  pushHand(hand: IHand): void
  setCurrentHand(hand: IHand | null): IHand | null
  setWinner(winner: ITeam): void
  getNextTurn(): IteratorResult<IMatch | null, IMatch | null | void>
}

export type IPoints = {
  0: number // team 0
  1: number // team 1
  2?: number // number of tied rounds
}

export type IGetNextPlayerResult = {
  currentPlayer?: IPlayer
  currentRound?: IRound
  points?: IPoints
}

export enum EHandPlayCommand {
  TRUCO,
  ENVIDO,
  ENVIDO_ENVIDO,
  REAL_ENVIDO,
  FALTA_ENVIDO,
  MAZO,
  FLOR,
  CONTRAFLOR,
}

export interface IPlayInstance {
  handIdx: number
  roundIdx: number
  player: IPlayer | null
  commands: Array<EHandPlayCommand> | null
  rounds: Array<IRound> | null
  use(idx: number): ICard | null
  say(command: EHandPlayCommand): IHand | null
}

export interface IHand {
  idx: number
  turn: number
  finished: boolean
  points: IPoints
  rounds: Array<IRound>
  currentPlayer: IPlayer | null
  currentRound: IRound | null
  play(): IPlayInstance
  pushRound(round: IRound): IRound
  setTurn(turn: number): IPlayer
  addPoints(team: 0 | 1, points: number): void
  setCurrentRound(round: IRound | null): IRound | null
  setCurrentPlayer(player: IPlayer | null): IPlayer | null
  setFinished(finshed: boolean): boolean
  getNextPlayer(): IteratorResult<IHand, IHand | void>
}

export interface ITable {
  forehandIdx: number
  cards: Array<Array<IPlayedCard>>
  players: Array<IPlayer>
  nextTurn(): IPlayer
  player(idx?: number): IPlayer
  getPlayerPosition(id: string): number
}

export interface IRound {
  tie: boolean
  winner: IPlayer | null
  highest: number
  cards: Array<IPlayedCard>
  play(playedCard: IPlayedCard): ICard
}
