import { EMatchState } from "@trucoshi/prisma"
import { SocketError } from "./server"
import {
  IAccountDetails,
  IChatMessage,
  ILobbyOptions,
  IMatchDetails,
  IMatchPreviousHand,
  IPlayerRanking,
  IPublicChatRoom,
  IPublicMatch,
  IPublicMatchInfo,
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
  NEW_MESSAGE = "NEW_MESSAGE",
  SET_SESSION = "SET_SESSION",
  REFRESH_IDENTITY = "REFRESH_IDENTITY",
  PREVIOUS_HAND = "PREVIOUS_HAND",
  UPDATE_MATCH = "UPDATE_MATCH",
  MATCH_DELETED = "MATCH_DELETED",
  WAITING_PLAY = "WAITING_PLAY",
  KICK_PLAYER = "PLAYER_KICKED",
  UPDATE_ACTIVE_MATCHES = "UPDATE_ACTIVE_MATCHES",
  WAITING_POSSIBLE_SAY = "WAITING_POSSIBLE_SAY",
  UPDATE_CHAT = "UPDAET_CHAT",
}

export interface ServerToClientEvents {
  [EServerEvent.PONG]: (serverTime: number, clientTime: number) => void
  [EServerEvent.PREVIOUS_HAND]: (value: IMatchPreviousHand, callback: () => void) => void
  [EServerEvent.UPDATE_CHAT]: (room: IPublicChatRoom) => void
  [EServerEvent.NEW_MESSAGE]: (roomId: string, message?: IChatMessage) => void
  [EServerEvent.UPDATE_ACTIVE_MATCHES]: (activeMatches: IPublicMatchInfo[]) => void
  [EServerEvent.UPDATE_MATCH]: (match: IPublicMatch, callback?: () => void) => void
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
  [EServerEvent.REFRESH_IDENTITY]: (
    userId: number,
    callback: (identityJwt: string | null) => void
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
  LIST_RANKING = "LIST_RANKING",
  JOIN_MATCH = "JOIN_MATCH",
  START_MATCH = "START_MATCH",
  SET_PLAYER_READY = "SET_PLAYER_READY",
  FETCH_MATCH = "FETCH_MATCH",
  FETCH_CHAT_ROOM = "FETCH_CHAT_ROOM",
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
  [EClientEvent.FETCH_CHAT_ROOM]: (roomId: string) => void
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
  [EClientEvent.LIST_RANKING]: (
    filters: {},
    callback: IEventCallback<{
      ranking: Array<IPlayerRanking>
    }>
  ) => void
  [EClientEvent.LOGIN]: (
    user: User,
    identityToken: string,
    callback: IEventCallback<{ activeMatches?: IPublicMatchInfo[] }>
  ) => void
}
