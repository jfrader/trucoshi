import { ICard, IHandPoints, IPlayedCard, IPlayer, IPublicPlayer, IPublicTeam, ITeam } from "./lib"

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
  me: IPublicPlayer
  rounds: IPlayedCard[][]
}

export interface IPublicMatchInfo {
  matchSessionId: string
  players: number
  maxPlayers: number
  state: EMatchTableState
}

export type IPublicChatRoom = Pick<IChatRoom, "id" | "messages">
export interface IChatMessage {
  date: number
  user: { id: string; key: string }
  system: boolean
  content: string
}

export interface IChatRoom {
  id: string
  messages: Array<IChatMessage>
  send(user: IChatMessage["user"], message: string): void
  system(message: string): void
  emit(): void
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
  SAY = "SAY",
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

  [EServerEvent.UPDATE_CHAT]: (room: IPublicChatRoom) => void

  [EServerEvent.UPDATE_MATCH]: (match: IPublicMatch) => void

  [EServerEvent.WAITING_PLAY]: (
    match: IPublicMatch,
    callback: (data: IWaitingPlayData) => void
  ) => void
}

export interface ClientToServerEvents {
  [EClientEvent.PING]: (msg: string) => void

  [EClientEvent.CHAT]: (matchId: string, msg: string, callback: () => void) => void

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

export enum EServerEvent {
  PONG = "PONG",
  PREVIOUS_HAND = "PREVIOUS_HAND",
  UPDATE_MATCH = "UPDATE_MATCH",
  WAITING_PLAY = "WAITING_PLAY",
  WAITING_POSSIBLE_SAY = "WAITING_POSSIBLE_SAY",
  UPDATE_CHAT = "UPDAET_CHAT",
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

export interface TMap<K, V> extends Map<K, V> {
  find(finder: (value: V) => boolean): V | void
}

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

  update(key: K, value: Partial<V>) {
    const current = this.get(key)
    if (!current) {
      throw new Error(`update(${key}) not found`)
    }
    this.set(key, { ...current, ...value })
  }
}
