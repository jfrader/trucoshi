import { ICard, IHandPoints, IPlayedCard, IPlayer, IPublicPlayer, IPublicTeam, ITeam } from "./lib"

export interface ISaidCommand {
  player: IPlayer | IPublicPlayer
  command: ECommand | number
}

export interface IMatchPreviousHand {
  rounds: IPlayedCard[][]
  points: IHandPoints
  matchSessionId: string
}

export interface IPublicMatch {
  state: EMatchTableState
  winner: ITeam | null
  matchSessionId: string
  teams: Array<IPublicTeam>
  players: Array<IPublicPlayer>
  me: IPublicPlayer | null
  isNewHand: boolean
  rounds: IPlayedCard[][]
}

export interface IPublicMatchInfo {
  ownerId: string
  matchSessionId: string
  players: number
  maxPlayers: number
  state: EMatchTableState
}

export type IPublicChatRoom = Pick<IChatRoom, "id" | "messages">
export interface IChatMessage {
  date: number
  user: { id: string; key: string }
  system?: boolean
  command?: boolean
  card?: boolean
  content: string
}

export interface IChatRoom {
  id: string
  messages: Array<IChatMessage>
  send(user: IChatMessage["user"], message: string): void
  card(user: IChatMessage["user"], command: ICard): void
  command(team: 0 | 1, command: ECommand | number): void
  system(message: string): void
  emit(message?: IChatMessage): void
}

export enum EChatSystem {
  TEAM_0 = 0,
  TEAM_1 = 1,
  SYSTEM = "SYSTEM",
}

export enum EMatchTableState {
  UNREADY,
  READY,
  STARTED,
  FINISHED,
}

export enum ESayCommand {
  MAZO = "MAZO",
}

export enum EFlorCommand {
  FLOR = "FLOR",
  CONTRAFLOR = "CONTRAFLOR",
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
  FINISHED = "FINISHED",
}

export type ECommand =
  | ESayCommand
  | EEnvidoCommand
  | EAnswerCommand
  | EEnvidoAnswerCommand
  | ETrucoCommand
  | EFlorCommand

export enum GAME_ERROR {
  MATCH_ALREADY_STARTED = "MATCH_ALREADY_STARTED",
  LOBBY_IS_FULL = "LOBBY_IS_FULL",
  UNEXPECTED_TEAM_SIZE = "UNEXPECTED_TEAM_SIZE",
  TEAM_NOT_READY = "TEAM_NOT_READY",
  TEAM_IS_FULL = "TEAM_IS_FULL",
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

export enum EServerEvent {
  PONG = "PONG",
  PREVIOUS_HAND = "PREVIOUS_HAND",
  UPDATE_MATCH = "UPDATE_MATCH",
  WAITING_PLAY = "WAITING_PLAY",
  PLAYER_USED_CARD = "PLAYER_USED_CARD",
  PLAYER_SAID_COMMAND = "PLAYER_SAID_COMMAND",
  WAITING_POSSIBLE_SAY = "WAITING_POSSIBLE_SAY",
  UPDATE_CHAT = "UPDAET_CHAT",
}

export enum EClientEvent {
  PING = "PING",
  SAY = "SAY",
  LEAVE_MATCH = "LEAVE_MATCH",
  CREATE_MATCH = "CREATE_MATCH",
  LIST_MATCHES = "LIST_MATCHES",
  JOIN_MATCH = "JOIN_MATCH",
  START_MATCH = "START_MATCH",
  SET_PLAYER_READY = "SET_PLAYER_READY",
  SET_SESSION = "SET_SESSION",
  FETCH_MATCH = "FETCH_MATCH",
  CHAT = "CHAT",
}

export type IEventCallback<T = {}> = (
  args: {
    success: boolean
  } & T
) => void

export interface ServerToClientEvents {
  [EServerEvent.PONG]: (msg: string) => void

  [EServerEvent.WAITING_POSSIBLE_SAY]: (
    match: IPublicMatch,
    callback: (data: IWaitingSayData) => void
  ) => void

  [EServerEvent.PREVIOUS_HAND]: (value: IMatchPreviousHand, callback: () => void) => void

  [EServerEvent.UPDATE_CHAT]: (room: IPublicChatRoom, message?: IChatMessage) => void

  [EServerEvent.UPDATE_MATCH]: (match: IPublicMatch) => void

  [EServerEvent.PLAYER_USED_CARD]: (match: IPublicMatch, card: IPlayedCard) => void

  [EServerEvent.PLAYER_SAID_COMMAND]: (match: IPublicMatch, command: ISaidCommand) => void

  [EServerEvent.WAITING_PLAY]: (
    match: IPublicMatch,
    callback: (data: IWaitingPlayData) => void
  ) => void
}

export interface ClientToServerEvents {
  [EClientEvent.PING]: (msg: string) => void

  [EClientEvent.CHAT]: (matchId: string, msg: string, callback: () => void) => void

  [EClientEvent.LEAVE_MATCH]: (matchId: string) => void

  [EClientEvent.CREATE_MATCH]: (callback: IEventCallback<{ match?: IPublicMatch }>) => void

  [EClientEvent.START_MATCH]: (
    matchId: string,
    callback: IEventCallback<{ matchSessionId?: string }>
  ) => void

  [EClientEvent.FETCH_MATCH]: (
    session: string | null,
    matchId: string,
    callback: IEventCallback
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
    id: string | null,
    session: string | null,
    callback?: IEventCallback<{ session?: string; activeMatches: Array<IPublicMatchInfo> }>
  ) => void

  [EClientEvent.JOIN_MATCH]: (
    matchSessionId: string,
    teamIdx: 0 | 1 | undefined,
    callback: IEventCallback<{ match?: IPublicMatch }>
  ) => void
}

export enum ETrucoshiMatchState {
  UNREADY,
  STARTED,
  FINISHED,
}

export type IWaitingPlayData = { cardIdx: number; card: ICard }
export type IWaitingPlayCallback = (data: IWaitingPlayData) => void | null

export type IWaitingSayData = { command: ECommand }
export type IWaitingSayCallback = (data: IWaitingSayData) => void | null

export class TMap<K, V> extends Map<K, V> {
  find(finder: (value: V) => boolean): V | void {
    let result: void | V = undefined

    for (let value of this.values()) {
      const find = finder(value)
      if (!result && find) {
        result = value
      }
    }
    return result
  }

  findAll(finder: (value: V) => boolean) {
    let result: Array<V> = []

    for (let value of this.values()) {
      const find = finder(value)
      if (find) {
        result.push(value)
      }
    }
    return result
  }

  getOrThrow(key?: K) {
    const result = key && this.get(key)
    if (!result) {
      throw new Error(`getOrThrow(${key}) not found`)
    }
    return result
  }
}
