import { EMatchState } from "@trucoshi/prisma"
import { SocketError } from "./server"
import {
  IAccountDetails,
  IChatMessage,
  ILobbyOptions,
  IMatchDetails,
  IMatchPreviousHand,
  IPlayedCard,
  IPublicChatRoom,
  IPublicMatch,
  IPublicMatchInfo,
  ISaidCommand,
  IUserData,
  IWaitingPlayData,
  IWaitingSayData,
} from "./types"
import { User } from "lightning-accounts"

export type IEventCallback<T = {}> = (
  args: {
    success: boolean
    error?: SocketError
  } & T
) => void

export enum EServerEvent {
  PONG = "PONG",
  SET_SESSION = "SET_SESSION",
  PREVIOUS_HAND = "PREVIOUS_HAND",
  UPDATE_MATCH = "UPDATE_MATCH",
  MATCH_DELETED = "MATCH_DELETED",
  WAITING_PLAY = "WAITING_PLAY",
  KICK_PLAYER = "PLAYER_KICKED",
  UPDATE_ACTIVE_MATCHES = "UPDATE_ACTIVE_MATCHES",
  PLAYER_USED_CARD = "PLAYER_USED_CARD",
  PLAYER_SAID_COMMAND = "PLAYER_SAID_COMMAND",
  WAITING_POSSIBLE_SAY = "WAITING_POSSIBLE_SAY",
  UPDATE_CHAT = "UPDAET_CHAT",
}

export interface ServerToClientEvents {
  [EServerEvent.PONG]: (serverTime: number, clientTime: number) => void
  [EServerEvent.PREVIOUS_HAND]: (value: IMatchPreviousHand, callback: () => void) => void
  [EServerEvent.UPDATE_CHAT]: (room: IPublicChatRoom, message?: IChatMessage) => void
  [EServerEvent.UPDATE_ACTIVE_MATCHES]: (activeMatches: IPublicMatchInfo[]) => void
  [EServerEvent.UPDATE_MATCH]: (match: IPublicMatch, callback?: () => void) => void
  [EServerEvent.PLAYER_USED_CARD]: (match: IPublicMatch, card: IPlayedCard) => void
  [EServerEvent.PLAYER_SAID_COMMAND]: (match: IPublicMatch, command: ISaidCommand) => void
  [EServerEvent.KICK_PLAYER]: (match: IPublicMatch, session: string, reason?: string) => void
  [EServerEvent.MATCH_DELETED]: (matchSessionId: string) => void
  [EServerEvent.SET_SESSION]: (
    userData: IUserData,
    serverVersion: string,
    activeMatches: Array<IPublicMatchInfo>
  ) => void
  [EServerEvent.WAITING_POSSIBLE_SAY]: (
    match: IPublicMatch,
    callback: (data: IWaitingSayData) => void
  ) => void
  [EServerEvent.WAITING_PLAY]: (
    match: IPublicMatch,
    callback: (data: IWaitingPlayData) => void
  ) => void
}

export enum EClientEvent {
  LOGIN = "LOGIN",
  LOGOUT = "LOGOUT",
  LEAVE_MATCH = "LEAVE_MATCH",
  CREATE_MATCH = "CREATE_MATCH",
  FETCH_ACCOUNT_DETAILS = "FETCH_ACCOUNT_DETAILS",
  FETCH_MATCH_DETAILS = "FETCH_MATCH_DETAILS",
  SET_MATCH_OPTIONS = "SET_MATCH_OPTIONS",
  LIST_MATCHES = "LIST_MATCHES",
  JOIN_MATCH = "JOIN_MATCH",
  START_MATCH = "START_MATCH",
  SET_PLAYER_READY = "SET_PLAYER_READY",
  FETCH_MATCH = "FETCH_MATCH",
  KICK_PLAYER = "KICK_PLAYER",
  CHAT = "CHAT",
  PING = "PING",
  SAY = "SAY",
}

export interface ClientToServerEvents {
  [EClientEvent.LOGOUT]: (callback: IEventCallback<{}>) => void
  [EClientEvent.PING]: (clientTime: number) => void
  [EClientEvent.CHAT]: (matchId: string, msg: string, callback: () => void) => void
  [EClientEvent.LEAVE_MATCH]: (matchId: string, callback?: IEventCallback<{}>) => void
  [EClientEvent.CREATE_MATCH]: (
    callback: IEventCallback<{ match?: IPublicMatch; activeMatches?: IPublicMatchInfo[] }>
  ) => void
  [EClientEvent.SET_MATCH_OPTIONS]: (
    identityJwt: string | null,
    matchSessionId: string,
    options: Partial<ILobbyOptions>,
    callback: IEventCallback<{ match?: IPublicMatch; activeMatches?: IPublicMatchInfo[] }>
  ) => void
  [EClientEvent.SET_PLAYER_READY]: (
    matchSessionId: string,
    ready: boolean,
    callback: IEventCallback<{ match?: IPublicMatch }>
  ) => void
  [EClientEvent.JOIN_MATCH]: (
    matchSessionId: string,
    teamIdx: 0 | 1 | undefined,
    callback: IEventCallback<{ match?: IPublicMatch; activeMatches?: IPublicMatchInfo[] }>
  ) => void
  [EClientEvent.START_MATCH]: (
    identityJwt: string | null,
    matchSessionId: string,
    callback: IEventCallback<{ matchSessionId?: string }>
  ) => void
  [EClientEvent.KICK_PLAYER]: (
    matchSessionId: string,
    key: string,
    callback: IEventCallback
  ) => void
  [EClientEvent.FETCH_MATCH]: (
    matchSessionId: string,
    callback: IEventCallback<{ match: IPublicMatch | null }>
  ) => void
  [EClientEvent.FETCH_MATCH_DETAILS]: (
    matchId: number,
    callback: IEventCallback<{ match: IMatchDetails | null }>
  ) => void
  [EClientEvent.FETCH_ACCOUNT_DETAILS]: (
    accountId: number,
    callback: IEventCallback<IAccountDetails>
  ) => void
  [EClientEvent.LIST_MATCHES]: (
    filters: { state?: Array<EMatchState> },
    callback: IEventCallback<{ matches: Array<IPublicMatchInfo> }>
  ) => void
  [EClientEvent.LOGIN]: (
    user: User,
    identityToken: string,
    callback: IEventCallback<{ activeMatches?: IPublicMatchInfo[] }>
  ) => void
}
