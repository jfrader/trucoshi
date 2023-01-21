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
  _players: Map<string, IPlayer>
  players: Array<IPlayer>
  points: TeamPoints
  addPoints(matchPoint: number, points: number): TeamPoints
}

export interface IMatch {
  teams: [ITeam, ITeam]
  hands: Array<IHand>
  winner: ITeam | null
  currentHand: IHand | null
  table: ITable
  play(): IPlayInstance | null
  addPoints(points: HandPoints): [ITeam, ITeam]
  pushHand(hand: IHand): void
  setCurrentHand(hand: IHand | null): IHand | null
  setWinner(winner: ITeam): void
  getNextTurn(): IteratorResult<IMatch | null, IMatch | null | void>
}

export interface TeamPoints {
  buenas: number
  malas: number
  winner: boolean
}

export interface HandPoints {
  0: number
  1: number
}

export interface RoundPoints {
  0: number
  1: number
  ties: number
}

export enum ESayCommand {
  TRUCO = "TRUCO",
  MAZO = "MAZO",
  FLOR = "FLOR",
  CONTRAFLOR = "CONTRAFLOR",
}

export enum EEnvidoCommand {
  ENVIDO = "ENVIDO",
  ENVIDO_ENVIDO = "ENVIDO_ENVIDO",
  REAL_ENVIDO = "REAL_ENVIDO",
  FALTA_ENVIDO = "FALTA_ENVIDO",
}

export type ECommand = ESayCommand | EEnvidoCommand

export interface TrucoState {
  state: 1 | 2 | 3 | 4
  teamIdx: 0 | 1 | null
}

export interface EnvidoState {
  accept: number
  decline: number
  teamIdx: 0 | 1 | null
}

export interface IPlayInstance {
  handIdx: number
  roundIdx: number
  state: EHandState
  truco: TrucoState
  envido: EnvidoState
  player: IPlayer | null
  commands: Array<ECommand> | null
  rounds: Array<IRound> | null
  use(idx: number): ICard | null
  say(command: ECommand): ECommand | null
}

export enum EHandState {
  WAITING_PLAY = "WAITING_PLAY",
  WAITING_FOR_TRUCO_ANSWER = "WAITING_FOR_TRUCO_ANSWER",
  WAITING_ENVIDO_ANSWER = "WAITING_ENVIDO_ANSWER",
  FINISHED = "FINISHED",
}

export type IHandCommands = {
  [key in ECommand]: (player: IPlayer) => void
}

export interface IHand {
  idx: number
  state: EHandState
  turn: number
  points: HandPoints
  truco: TrucoState
  envido: EnvidoState
  rounds: Array<IRound>
  currentPlayer: IPlayer | null
  currentRound: IRound | null
  disabledPlayerIds: Array<string>
  commands: IHandCommands
  finished: () => boolean
  play(): IPlayInstance | null
  pushRound(round: IRound): IRound
  setTurn(turn: number): IPlayer
  addPoints(team: 0 | 1, points: number): void
  disablePlayer(player: IPlayer): void
  setCurrentRound(round: IRound | null): IRound | null
  setCurrentPlayer(player: IPlayer | null): IPlayer | null
  setState(state: EHandState): EHandState
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
  use(playedCard: IPlayedCard): ICard
}

export type IEnvidoCalculatorResult = {
  accept: number
  decline: number
  next: Array<ECommand>
}

export type IEnvidoCalculatorArgs = {
  teams: [ITeam, ITeam]
  matchPoint: number
}

export type IEnvidoCalculator = {
  [key in EEnvidoCommand]: (args?: IEnvidoCalculatorArgs) => IEnvidoCalculatorResult
}
