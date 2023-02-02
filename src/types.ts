import { Socket } from "socket.io"
import { ICard, IHandPoints, IPlayedCard, IPlayer, IPublicPlayer, IPublicTeam, ITeam } from "./lib"

export interface IPublicMatch {
  state: EMatchTableState
  winner: ITeam | null
  matchSessionId: string
  teams: Array<IPublicTeam>
  players: Array<IPublicPlayer>
  me: IPublicPlayer
  rounds: IPlayedCard[][]
  prevRounds: IPlayedCard[][] | null
  prevHandPoints?: IHandPoints | null
}

export enum EMatchTableState {
  UNREADY,
  READY,
  STARTED,
  FINISHED,
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

export enum EHandState {
  WAITING_PLAY = "WAITING_PLAY",
  WAITING_FOR_TRUCO_ANSWER = "WAITING_FOR_TRUCO_ANSWER",
  WAITING_ENVIDO_ANSWER = "WAITING_ENVIDO_ANSWER",
  FINISHED = "FINISHED",
}

export type ECommand = ESayCommand | EEnvidoCommand

export enum GAME_ERROR {
  MATCH_ALREADY_STARTED = "MATCH_ALREADY_STARTED",
  LOBBY_IS_FULL = "LOBBY_IS_FULL",
  UNEXPECTED_TEAM_SIZE = "UNEXPECTED_TEAM_SIZE",
  TEAM_NOT_READY = "TEAM_NOT_READY",
  TEAM_IS_FULL = "TEAM_IS_FULL",
}

export interface EnvidoState {
  accept: number
  decline: number
  teamIdx: 0 | 1 | null
}

export type IHandCommands = {
  [key in ECommand]: (player: IPlayer) => void
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

export enum EClientEvent {
  PING = "PING",
  PLAY = "PLAY",
  CREATE_MATCH = "CREATE_MATCH",
  GET_MATCH = "GET_MATCH",
  JOIN_MATCH = "JOIN_MATCH",
  START_MATCH = "START_MATCH",
  SET_PLAYER_READY = "SET_PLAYER_READY",
  SET_SESSION = "SET_SESSION",
}

export enum EServerEvent {
  PONG = "PONG",
  UPDATE_MATCH = "UPDATE_MATCH",
  WAITING_PLAY = "WAITING_PLAY",
}

export interface TrucoshiSocket extends Socket {
  session?: string
}

export enum ETrucoshiMatchState {
  UNREADY,
  STARTED,
  FINISHED,
}

export type IWaitingPlayData =
  | { cardIdx: number; card: ICard; command?: undefined }
  | { cardIdx?: undefined; card?: undefined; command: ECommand }

export type IWaitingPlayCallback = (data: IWaitingPlayData) => void | null
