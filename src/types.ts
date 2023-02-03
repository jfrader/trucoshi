import { ICard, IHandPoints, IPlayedCard, IPlayer, IPublicPlayer, IPublicTeam, ITeam } from "./lib"
import { IPublicMatchInfo } from "./server/classes/MatchTable"

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
  LIST_MATCHES = "LIST_MATCHES",
  JOIN_MATCH = "JOIN_MATCH",
  START_MATCH = "START_MATCH",
  SET_PLAYER_READY = "SET_PLAYER_READY",
  SET_SESSION = "SET_SESSION",
  FETCH_MATCH = "FETCH_MATCH",
}

export type IEventCallback<T = {}> = (
  args: {
    success: boolean
  } & T
) => void

export interface ServerToClientEvents {
  [EServerEvent.PONG]: (msg: string) => void

  [EServerEvent.UPDATE_MATCH]: (match: IPublicMatch) => void

  [EServerEvent.WAITING_PLAY]: (
    match: IPublicMatch,
    callback: (data: IWaitingPlayData) => void
  ) => void
}

export interface ClientToServerEvents {
  [EClientEvent.PING]: (msg: string) => void

  [EClientEvent.CREATE_MATCH]: (callback: IEventCallback<{ match?: IPublicMatch }>) => void

  [EClientEvent.START_MATCH]: (callback: IEventCallback<{ matchSessionId?: string }>) => void

  [EClientEvent.FETCH_MATCH]: (
    session: string | null,
    matchId: string,
    callback: IEventCallback<{ match?: IPublicMatch | null }>
  ) => void

  [EClientEvent.LIST_MATCHES]: (
    filters: { state?: Array<EMatchTableState> },
    callback: IEventCallback<{ matches: Array<IPublicMatchInfo> }>
  ) => void

  [EClientEvent.SET_PLAYER_READY]: (
    matchSessionId: string,
    ready: boolean,
    callback: IEventCallback<{ match?: IPublicMatch }>
  ) => void

  [EClientEvent.SET_SESSION]: (
    session: string | null,
    id: string | null,
    callback?: IEventCallback<{ session?: string; activeMatches: Array<IPublicMatchInfo> }>
  ) => void

  [EClientEvent.JOIN_MATCH]: (
    matchSessionId: string,
    teamIdx: 0 | 1 | undefined,
    callback: IEventCallback<{ match?: IPublicMatch }>
  ) => void
}

export enum EServerEvent {
  PONG = "PONG",
  UPDATE_MATCH = "UPDATE_MATCH",
  WAITING_PLAY = "WAITING_PLAY",
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
