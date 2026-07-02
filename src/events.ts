import { SocketError } from "./server"
import {
  EMatchState,
  IAdminCreateChestRewardCodeInput,
  IAdminCreateChestRewardCodeResult,
  IAdminDashboard,
  IAccountDetails,
  CardSkinId,
  ICard,
  IChatMessage,
  IEquippedDeck,
  ILobbyOptions,
  IInventoryCardGroup,
  IMatchDetails,
  IPlayerRanking,
  IPublicChatRoom,
  IPublicMatch,
  IPublicMatchInfo,
  IPublicMatchStats,
  IJoinQueueOptions,
  IQueueMatchFound,
  IQueueStatus,
  IRewardCodeRedeemResult,
  ITreasureOpenResult,
  ITreasureStatus,
  ITrucoshiStats,
  IUserData,
  IWaitingPlayData,
  IWaitingSayData,
} from "./types"

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
  UPDATE_MATCH = "UPDATE_MATCH",
  MATCH_DELETED = "MATCH_DELETED",
  WAITING_PLAY = "WAITING_PLAY",
  KICK_PLAYER = "PLAYER_KICKED",
  UPDATE_ACTIVE_MATCHES = "UPDATE_ACTIVE_MATCHES",
  UPDATE_PUBLIC_MATCHES = "UPDATE_PUBLIC_MATCHES",
  PAUSE_MATCH_REQUEST = "PAUSE_MATCH_REQUEST",
  UNPAUSE_STARTED = "UNPAUSE_STARTED",
  PLAY_AGAIN_REQUEST = "PLAY_AGAIN_REQUEST",
  WAITING_POSSIBLE_SAY = "WAITING_POSSIBLE_SAY",
  UPDATE_CHAT = "UPDAET_CHAT",
  UPDATE_STATS = "UPDATE_STATS",
  QUEUE_UPDATE = "QUEUE_UPDATE",
  QUEUE_MATCH_FOUND = "QUEUE_MATCH_FOUND",
}

export interface ServerToClientEvents {
  [EServerEvent.PONG]: (serverTime: number, clientTime: number) => void
  [EServerEvent.UPDATE_CHAT]: (room: IPublicChatRoom) => void
  [EServerEvent.UPDATE_STATS]: (room: ITrucoshiStats) => void
  [EServerEvent.QUEUE_UPDATE]: (status: IQueueStatus) => void
  [EServerEvent.QUEUE_MATCH_FOUND]: (match: IQueueMatchFound) => void
  [EServerEvent.NEW_MESSAGE]: (roomId: string, message?: IChatMessage) => void
  [EServerEvent.UPDATE_ACTIVE_MATCHES]: (activeMatches: IPublicMatchInfo[]) => void
  [EServerEvent.UPDATE_PUBLIC_MATCHES]: (publicMatches: IPublicMatchInfo[]) => void
  [EServerEvent.UPDATE_MATCH]: (
    match: IPublicMatch,
    stats?: IPublicMatchStats,
    callback?: () => void
  ) => void
  [EServerEvent.PAUSE_MATCH_REQUEST]: (
    roomId: string,
    fromOpponent: boolean,
    requestExpiresAt: number,
    answer: (answer: boolean) => void
  ) => void
  [EServerEvent.PLAY_AGAIN_REQUEST]: (roomId: string, requestExpiresAt: number) => void
  [EServerEvent.UNPAUSE_STARTED]: (roomId: string, unpausesAt: number) => void
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
  LOGOUT = "LOGOUT",
  LEAVE_MATCH = "LEAVE_MATCH",
  CREATE_MATCH = "CREATE_MATCH",
  FETCH_ACCOUNT_DETAILS = "FETCH_ACCOUNT_DETAILS",
  FETCH_MATCH_DETAILS = "FETCH_MATCH_DETAILS",
  SET_MATCH_OPTIONS = "SET_MATCH_OPTIONS",
  LIST_MATCHES = "LIST_MATCHES",
  LIST_RANKING = "LIST_RANKING",
  SET_PLAYER_READY = "SET_PLAYER_READY",
  JOIN_MATCH = "JOIN_MATCH",
  START_MATCH = "START_MATCH",
  PAUSE_MATCH = "PAUSE_MATCH",
  PLAY_AGAIN = "PLAY_AGAIN",
  JOIN_QUEUE = "JOIN_QUEUE",
  LEAVE_QUEUE = "LEAVE_QUEUE",
  FETCH_INVENTORY = "FETCH_INVENTORY",
  SET_DECK_CARD_SKIN = "SET_DECK_CARD_SKIN",
  FETCH_TREASURE_STATUS = "FETCH_TREASURE_STATUS",
  OPEN_TREASURE_CHEST = "OPEN_TREASURE_CHEST",
  DEV_GRANT_TREASURE_CHEST = "DEV_GRANT_TREASURE_CHEST",
  ADMIN_FETCH_DASHBOARD = "ADMIN_FETCH_DASHBOARD",
  ADMIN_CREATE_CHEST_REWARD_CODE = "ADMIN_CREATE_CHEST_REWARD_CODE",
  REDEEM_REWARD_CODE = "REDEEM_REWARD_CODE",
  ADD_BOT = "ADD_BOT",
  FETCH_MATCH = "FETCH_MATCH",
  FETCH_CHAT_ROOM = "FETCH_CHAT_ROOM",
  KICK_PLAYER = "KICK_PLAYER",
  CHAT = "CHAT",
  PING = "PING",
  SAY = "SAY",
  JOIN_ROOM = "JOIN_ROOM",
  LEAVE_ROOM = "LEAVE_ROOM",
}

export type SayType = "mate" | "ceba_toma_mate"

export interface ClientToServerEvents {
  [EClientEvent.LOGOUT]: (callback: IEventCallback<{}>) => void
  [EClientEvent.PING]: (clientTime: number) => void
  [EClientEvent.CHAT]: (matchId: string, msg: string, callback?: IEventCallback<{}>) => void
  [EClientEvent.SAY]: (matchId: string, msg: SayType, callback?: IEventCallback<{}>) => void
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
  [EClientEvent.JOIN_ROOM]: (roomId: string) => void
  [EClientEvent.LEAVE_ROOM]: (roomId: string) => void
  [EClientEvent.ADD_BOT]: (
    matchSessionId: string,
    teamIdx: 0 | 1 | undefined,
    callback: IEventCallback<{ match?: IPublicMatch }>
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
  [EClientEvent.PAUSE_MATCH]: (
    matchSessionId: string,
    pause: boolean,
    callback?: IEventCallback<{ paused?: boolean }>
  ) => void
  [EClientEvent.PLAY_AGAIN]: (
    matchSessionId: string,
    callback?: IEventCallback<{ newMatchSessionId?: string }>
  ) => void
  [EClientEvent.JOIN_QUEUE]: (
    options: IJoinQueueOptions,
    callback: IEventCallback<{ status?: IQueueStatus }>
  ) => void
  [EClientEvent.LEAVE_QUEUE]: (callback?: IEventCallback<{}>) => void
  [EClientEvent.FETCH_INVENTORY]: (
    callback: IEventCallback<{ inventory: IInventoryCardGroup[]; equippedDeck: IEquippedDeck }>
  ) => void
  [EClientEvent.SET_DECK_CARD_SKIN]: (
    card: ICard,
    cardSkinId: CardSkinId | null,
    callback: IEventCallback<{ inventory: IInventoryCardGroup[]; equippedDeck: IEquippedDeck }>
  ) => void
  [EClientEvent.FETCH_TREASURE_STATUS]: (
    callback: IEventCallback<{ treasureStatus: ITreasureStatus }>
  ) => void
  [EClientEvent.OPEN_TREASURE_CHEST]: (
    chestId: number,
    callback: IEventCallback<{
      treasureStatus: ITreasureStatus
      treasureResult: ITreasureOpenResult
      inventory: IInventoryCardGroup[]
      equippedDeck: IEquippedDeck
    }>
  ) => void
  [EClientEvent.DEV_GRANT_TREASURE_CHEST]: (
    callback: IEventCallback<{ treasureStatus: ITreasureStatus }>
  ) => void
  [EClientEvent.ADMIN_FETCH_DASHBOARD]: (
    callback: IEventCallback<{ dashboard: IAdminDashboard }>
  ) => void
  [EClientEvent.ADMIN_CREATE_CHEST_REWARD_CODE]: (
    input: IAdminCreateChestRewardCodeInput,
    callback: IEventCallback<IAdminCreateChestRewardCodeResult>
  ) => void
  [EClientEvent.REDEEM_REWARD_CODE]: (
    code: string,
    callback: IEventCallback<IRewardCodeRedeemResult>
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
}
