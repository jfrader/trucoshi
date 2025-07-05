export * from "./events"

export { CARDS, CARDS_HUMAN_READABLE, BURNT_CARD } from "./lib/constants"

import { User } from "lightning-accounts"
import { CARDS } from "./lib"
import { Match, MatchPlayer, MatchHand, UserStats } from "@trucoshi/prisma"
import { IHand } from "./truco"

export enum EMatchState {
  UNREADY = "UNREADY",
  READY = "READY",
  STARTED = "STARTED",
  FINISHED = "FINISHED",
}

export interface IMatchDetails extends Match {
  players: Array<Pick<MatchPlayer, "id" | "accountId" | "teamIdx" | "name" | "idx">>
  hands: Array<MatchHand>
}
export interface IAccountDetails {
  stats: UserStats | null
  account: User | null
  matches: Array<Match>
}

export interface IUserData {
  key: string
  name: string
  session: string
  account: User | null
}

export interface ILobbyOptions {
  maxPlayers: 2 | 4 | 6
  faltaEnvido: 1 | 2
  flor: boolean
  matchPoint: number
  handAckTime: number
  turnTime: number
  abandonTime: number
  satsPerPlayer: number
}

export interface ISaidCommand {
  player: IPlayer | IPublicPlayer
  command: ECommand | number
}

export interface IMatchPreviousHand {
  envido: { winner: IPublicPlayer; data?: { value: number; cards: ICard[] } } | null
  flor: { data: Array<{ idx: number; value: number; cards: ICard[] }> } | null
  rounds: IPlayedCard[][]
  points: IHandPoints
  matchSessionId: string
}

export interface IPublicMatch {
  id?: number
  options: ILobbyOptions
  busy: boolean
  state: EMatchState
  handState: EHandState | null
  winner: ITeam | null
  matchSessionId: string
  ownerKey: string
  teams: Array<IPublicTeam>
  players: Array<IPublicPlayer>
  me: IPublicPlayer | null
  freshHand: boolean
  rounds: IPlayedCard[][]
  lastCard?: ICard | null
  lastCommand?: ECommand | number | null
}

export interface IPublicMatchInfo {
  ownerId: string
  matchSessionId: string
  players: number
  options: ILobbyOptions
  state: EMatchState
}

export type IPublicChatRoom = Pick<IChatRoom, "id" | "messages">
export interface IChatMessage {
  id: string
  date: number
  user: { name: string; key: string }
  system?: boolean
  command?: boolean
  card?: boolean
  content: string
}

export interface IChatRoom {
  id: string
  messages: Array<IChatMessage>
  socket: {
    emit(socket: string): void
  }
  send(user: IChatMessage["user"], message: string): void
  card(user: IChatMessage["user"], card: ICard): void
  command(team: 0 | 1, command: ECommand | number): void
  system(message: string): void
  emit(message?: IChatMessage): void
}

export enum EChatSystem {
  TEAM_0 = 0,
  TEAM_1 = 1,
  SYSTEM = "SYSTEM",
}

export enum ESayCommand {
  MAZO = "MAZO",
}

export enum EFlorCommand {
  FLOR = "FLOR",
  CONTRAFLOR = "CONTRAFLOR",
  CONTRAFLOR_AL_RESTO = "CONTRAFLOR_AL_RESTO",
  ACHICO = "ACHICO",
}

export enum ETrucoCommand {
  TRUCO = "TRUCO",
  RE_TRUCO = "RE_TRUCO",
  VALE_CUATRO = "VALE_CUATRO",
}

export enum EAnswerCommand {
  QUIERO = "QUIERO",
  NO_QUIERO = "NO_QUIERO",
}

export enum EEnvidoAnswerCommand {
  SON_BUENAS = "SON_BUENAS",
}

export enum EEnvidoCommand {
  ENVIDO = "ENVIDO",
  REAL_ENVIDO = "REAL_ENVIDO",
  FALTA_ENVIDO = "FALTA_ENVIDO",
}

export enum EHandState {
  WAITING_PLAY = "WAITING_PLAY",
  WAITING_FOR_TRUCO_ANSWER = "WAITING_FOR_TRUCO_ANSWER",
  WAITING_ENVIDO_ANSWER = "WAITING_ENVIDO_ANSWER",
  WAITING_ENVIDO_POINTS_ANSWER = "WAITING_ENVIDO_POINTS_ANSWER",
  WAITING_FLOR_ANSWER = "WAITING_FLOR_ANSWER",
  BEFORE_FINISHED = "BEFORE_FINISHED",
  FINISHED = "FINISHED",
}

export type ECommand =
  | ESayCommand
  | EEnvidoCommand
  | EAnswerCommand
  | EEnvidoAnswerCommand
  | ETrucoCommand
  | EFlorCommand

export type IHandCommands = {
  [key in ECommand]: (hand: IHand, player: IPlayer) => void
}

export type IWaitingPlayData = { cardIdx: number; card: ICard }
export type IWaitingPlayCallback = (data: IWaitingPlayData) => void | null

export type IWaitingSayData = { command: ECommand | number }
export type IWaitingSayCallback = (data: IWaitingSayData) => void | null

export enum GAME_ERROR {
  INVALID_IDENTITY = "INVALID_IDENTITY",
  UNEXPECTED_ERROR = "UNEXPECTED_ERROR",
  FORBIDDEN = "FORBIDDEN",
  NOT_FOUND = "NOT_FOUND",
  MATCH_ALREADY_STARTED = "MATCH_ALREADY_STARTED",
  LOBBY_IS_FULL = "LOBBY_IS_FULL",
  UNEXPECTED_TEAM_SIZE = "UNEXPECTED_TEAM_SIZE",
  TEAM_NOT_READY = "TEAM_NOT_READY",
  TEAM_IS_FULL = "TEAM_IS_FULL",
  INVALID_ENVIDO_POINTS = "INVALID_ENVIDO_POINTS",
  ENVIDO_NOT_ACCEPTED = "ENVIDO_NOT_ACCEPTED",
  INVALID_COMAND = "INVALID_COMAND",
  INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
  GAME_REQUIRES_ACCOUNT = "GAME_REQUIRES_ACCOUNT",
  NO_FLOR = "NO_FLOR",
}

export interface EnvidoState {
  accept: number
  decline: number
  teamIdx: 0 | 1 | null
}

export type IEnvidoCalculatorResult = {
  accept: number
  decline: number
  replace?: number
  next: Array<ECommand>
}

export type IFaltaEnvidoCalculatorArgs = {
  teams: [ITeam, ITeam]
  options: ILobbyOptions
}

export type IEnvidoCalculatorArgs = {
  stake: number
  declineStake: number
} & (IFaltaEnvidoCalculatorArgs | never)

export type IEnvidoCalculator = {
  [key in EEnvidoCommand]: (args?: IEnvidoCalculatorArgs) => IEnvidoCalculatorResult
}

export interface IDeck {
  random: IRandom
  cards: Array<ICard>
  usedCards: Array<ICard>
  pick(card: ICard): ICard | null
  takeCard(): ICard
  takeThree(): [ICard, ICard, ICard]
  shuffle(dealerIdx: number): IDeck
}

export type ICard = keyof typeof CARDS

export interface IPlayedCard {
  key: string
  player: IPlayer | IPublicPlayer
  card: ICard
}

export interface IHandPoints {
  0: number
  1: number
}

export interface IRandom {
  secret: string
  clients: string[]
  nonce: number
  next(): void
  pick(idx: number, max: number): number
  reveal(): { secret: string; clients: string[] }
}

export type IPublicPlayer = Pick<
  IPlayer,
  | "idx"
  | "key"
  | "name"
  | "abandonedTime"
  | "accountId"
  | "avatarUrl"
  | "disabled"
  | "abandoned"
  | "ready"
  | "hand"
  | "usedHand"
  | "prevHand"
  | "teamIdx"
  | "isTurn"
  | "turnExpiresAt"
  | "turnExtensionExpiresAt"
  | "isEnvidoTurn"
  | "isOwner"
> &
  (
    | {
        isMe?: true
        commands: IPlayer["commands"]
        hasFlor: IPlayer["hasFlor"]
        envido: IPlayer["envido"]
        payRequestId?: IPlayer["payRequestId"]
      }
    | {
        isMe?: false
        commands?: undefined
        hasFlor?: undefined
        envido?: undefined
        payRequestId?: undefined
      }
  )

export type IPublicTeam = Pick<ITeam, "points" | "id" | "name"> & { players: Array<IPublicPlayer> }

export interface IPlayer {
  idx: number
  secret: string
  teamIdx: number
  accountId: number | undefined
  matchPlayerId: number | undefined
  avatarUrl: string | undefined
  name: string
  key: string
  session: string
  payRequestId?: number
  abandonedTime: number
  hand: Array<ICard>
  usedHand: Array<ICard>
  prevHand: Array<ICard>
  envido: Array<{ value: number; cards: ICard[] }>
  _commands: Set<ECommand>
  get commands(): Array<ECommand>
  isTurn: boolean
  turnExpiresAt: number | null // Date.now()
  turnExtensionExpiresAt: number | null // Date.now()
  hasFlor: boolean
  hasSaidFlorPoints: boolean
  hasSaidEnvidoPoints: boolean
  isEnvidoTurn: boolean
  isOwner: boolean
  disabled: boolean
  abandoned: boolean
  ready: boolean
  saidEnvidoPoints(): void
  saidFlorPoints(): void
  resetCommands(): void
  calculateEnvido(): Array<{ value: number; cards: ICard[] }>
  setIdx(idx: number): void
  setPayRequest(id?: number): void
  setMatchPlayerId(id?: number): void
  setTurn(turn: boolean): void
  setTurnExpiration(...args: [number, number | null] | [null, null]): void
  setEnvidoTurn(turn: boolean): void
  getPublicPlayer(session?: string): IPublicPlayer
  setSession(session: string): void
  setIsOwner(isOwner: boolean): void
  addDisconnectedTime(time: number): void
  enable(): void
  disable(): void
  abandon(): void
  setReady(ready: boolean): void
  setHand(hand: Array<ICard>): Array<ICard>
  useCard(idx: number, card: ICard): ICard | null
}

export interface ITeam {
  _players: Map<string, IPlayer>
  id: 0 | 1
  name: string
  players: Array<IPlayer>
  points: ITeamPoints
  pointsToWin(matchPoint: number): number
  getPublicTeam(playerSession?: string): IPublicTeam
  isTeamDisabled(): boolean
  disable(player: IPlayer): boolean
  enable(player?: IPlayer): boolean
  addPoints(matchPoint: number, points: number, simulate?: boolean): ITeamPoints
}

export interface ITeamPoints {
  buenas: number
  malas: number
  winner: boolean
}

export type IHandRoundLog = {
  player: number
  card?: ICard
  command?: ECommand | number
}

export type IPublicUser = Pick<User, "id" | "email" | "name" | "role">
