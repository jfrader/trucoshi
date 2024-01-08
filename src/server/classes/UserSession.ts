import { User } from "lightning-accounts"
import logger from "../../utils/logger"
import { PLAYER_TIMEOUT_GRACE } from "../constants"

const log = logger.child({ class: "UserSession" })

export interface IUserData {
  key: string
  name: string
  session: string
  account: User | null
}

export interface IUserSession extends IUserData {
  _name: string
  online: boolean
  ownedMatches: Set<string>
  reconnectTimeouts: Map<string, NodeJS.Timeout | null>
  reconnectPromises: Map<string, () => void> // room (matchId), resolver promise
  setAccount(user: User | null): void
  getPublicInfo(): Omit<IUserSession, "session" | "user">
  waitReconnection(room: string, timeout: number): Promise<void>
  resolveWaitingPromises(room: string): void
  connect(): void
  disconnect(): void
  reconnect(room: string): void
  setName(id: string): void
  getUserData(): IUserData
}

const WAIT_RECONNECTION_ABANDON_DEBUG_MSG = `User disconnected from match or was inactive and timed out with no reconnection`

export interface ISocketMatchState {
  isWaitingForPlay: boolean
  isWaitingForSay: boolean
}

export function UserSession(key: string, username: string, session: string) {
  const userSession: IUserSession = {
    _name: username,
    key,
    account: null,
    session,
    online: true,
    ownedMatches: new Set(),
    reconnectTimeouts: new Map(),
    reconnectPromises: new Map(),
    get name() {
      return userSession.account ? userSession.account.name : userSession._name
    },
    set name(value) {
      userSession._name = value
    },
    getPublicInfo() {
      const { session: _session, ...rest } = userSession
      return rest
    },
    setAccount(user) {
      userSession.account = user
    },
    getUserData() {
      const { key, name, session, account } = userSession
      return { key, name, session, account }
    },
    waitReconnection(room, timeout) {
      return new Promise<void>((resolve, reject) => {
        userSession.resolveWaitingPromises(room)
        log.trace(
          userSession.getPublicInfo(),
          `User disconnected or left, waiting for ${timeout}ms to reconnect`
        )
        userSession.reconnectTimeouts.set(
          room,
          setTimeout(() => {
            log.trace(userSession.getPublicInfo(), WAIT_RECONNECTION_ABANDON_DEBUG_MSG)
            reject()
            userSession.reconnectPromises.delete(room)
          }, timeout + PLAYER_TIMEOUT_GRACE)
        )
        userSession.reconnectPromises.set(room, resolve)
      })
    },
    resolveWaitingPromises(room) {
      const promise = userSession.reconnectPromises.get(room)
      if (promise) {
        promise()
        userSession.reconnectPromises.delete(room)
      }

      const timeout = userSession.reconnectTimeouts.get(room)
      if (timeout) {
        clearTimeout(timeout)
        userSession.reconnectTimeouts.delete(room)
      }
    },
    reconnect(room) {
      userSession.resolveWaitingPromises(room)
      userSession.connect()
    },
    connect() {
      userSession.online = true
    },
    disconnect() {
      userSession.online = false
    },
    setName(id) {
      userSession.name = id
    },
  }

  return userSession
}
