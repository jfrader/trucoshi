import { IGameLoop } from "."
import { IPublicPlayer } from "./classes/Player"
import { CARDS } from "./constants"

export type ICard = keyof typeof CARDS

export interface IDeck {
  cards: Array<ICard>
  usedCards: Array<ICard>
  takeCard(): ICard
  shuffle(): IDeck
}

export interface IPlayedCard {
  get key(): string
  player: IPlayer & IPublicPlayer
  card: ICard
}

export interface IPlayer {
  teamIdx: number
  id: string
  session?: string
  hand: Array<ICard>
  commands: Array<ECommand>
  usedHand: Array<ICard>
  disabled: boolean
  ready: boolean
  setSession(session: string): void
  enable(): void
  disable(): void
  setReady(ready: boolean): void
  setHand(hand: Array<ICard>): Array<ICard>
  useCard(idx: number): ICard | null
}

export interface ITeam {
  _players: Map<string, IPlayer>
  players: Array<IPlayer>
  points: TeamPoints
  isTeamDisabled(): boolean
  disable(player: IPlayer): boolean
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
  QUIERO = "QUIERO",
  NO_QUIERO = "NO_QUIERO",
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

export interface ITruco {
  state: 1 | 2 | 3 | 4
  teamIdx: 0 | 1 | null
  answer: boolean | null
  turn: number
  players: Array<IPlayer>
  currentPlayer: IPlayer | null
  generator: Generator<ITruco, void, unknown>
  sayTruco(teamIdx: 0 | 1, players: Array<IPlayer>): ITruco
  setPlayers(players: Array<IPlayer>): void
  setAnswer(answer: boolean | null): ITruco
  setTurn(turn: number): number
  setTeam(idx: 0 | 1): 0 | 1
  setCurrentPlayer(player: IPlayer | null): IPlayer | null
  getNextPlayer(): IteratorResult<ITruco, ITruco | void>
}

export interface EnvidoState {
  accept: number
  decline: number
  teamIdx: 0 | 1 | null
}

export interface IPlayInstance {
  teams: [ITeam, ITeam]
  handIdx: number
  roundIdx: number
  state: EHandState
  truco: ITruco
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
  truco: ITruco
  envido: EnvidoState
  rounds: Array<IRound>
  _currentPlayer: IPlayer | null
  get currentPlayer(): IPlayer | null
  set currentPlayer(player: IPlayer | null)
  currentRound: IRound | null
  commands: IHandCommands
  finished: () => boolean
  play(): IPlayInstance | null
  nextTurn(): void
  use(idx: number): ICard | null
  pushRound(round: IRound): IRound
  setTurn(turn: number): IPlayer
  addPoints(team: 0 | 1, points: number): void
  disablePlayer(player: IPlayer): void
  setCurrentRound(round: IRound | null): IRound | null
  setCurrentPlayer(player: IPlayer | null): IPlayer | null
  setState(state: EHandState): EHandState
  getNextPlayer(): IteratorResult<IHand, IHand | void>
}

export interface IPrivateLobby {
  gameLoop?: IGameLoop
  lastTeamIdx: 0 | 1
  _players: Array<IPlayer | { id?: undefined, session?: undefined }>
  get players(): Array<IPlayer>
  teams: Array<ITeam>
  maxPlayers: number
  table: ITable | null
  full: boolean
  ready: boolean
  started: boolean
  addPlayer(id: string, session: string, teamIdx?: 0 | 1): IPlayer
  removePlayer(id: string): ILobby
  calculateReady(): boolean
  calculateFull(): boolean
  startMatch(matchPoint?: 9 | 12 | 15): IGameLoop
}

export interface ILobby
  extends Pick<
    IPrivateLobby,
    | "addPlayer"
    | "removePlayer"
    | "startMatch"
    | "ready"
    | "full"
    | "started"
    | "teams"
    | "players"
    | "gameLoop"
    | "table"
    | "calculateReady"
  > {}

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
  turn: number
  nextTurn(): void
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
