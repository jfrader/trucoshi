import { User } from "lightning-accounts"
import logger from "../../utils/logger"
import { PLAYER_TIMEOUT_GRACE } from "../constants"
import { IUserData } from "../../types"
import { TMap } from "./TMap"

const log = logger.child({ class: "UserSession" })

export interface IUserSession extends IUserData {
  name: string
  online: boolean
  ownedMatches: Set<string>
  timeouts: {
    disconnection: TMap<string, UserTimeout> // room (matchId), resolver promise
    turn: TMap<string, UserTimeout> // room (matchId), resolver promise
  }
  setAccount(user: User | null): void
  getPublicInfo(): Omit<IUserSession, "session" | "user">
  waitReconnection(room: string, timeout: number, type: "disconnection" | "turn"): Promise<void>
  resolveWaitingPromises(room: string, type?: "disconnection" | "turn"): void
  connect(): void
  disconnect(): void
  reconnect(room: string, type?: "disconnection" | "turn"): void
  setName(id: string): void
  getUserData(): IUserData
}

interface UserTimeout {
  timeout?: NodeJS.Timeout
  resolve?: () => void
  reject?: (err?: unknown) => void
}

const WAIT_RECONNECTION_ABANDON_DEBUG_MSG = `User disconnected from match or was inactive and timed out with no reconnection`

export interface ISocketMatchState {
  isWaitingForPlay: boolean
  isWaitingForSay: boolean
}

export function UserSession(key: string, username: string, session: string) {
  const userSession: IUserSession = {
    name: username,
    key,
    account: null,
    session,
    online: true,
    ownedMatches: new Set(),
    timeouts: {
      disconnection: new TMap<string, UserTimeout>(),
      turn: new TMap<string, UserTimeout>(),
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
    waitReconnection(room, timeout, type) {
      return new Promise<void>((resolve, reject) => {
        userSession.resolveWaitingPromises(room, type)
        log.trace(
          userSession.getPublicInfo(),
          `User disconnected or left, waiting for ${timeout}ms to reconnect`
        )
        userSession.timeouts[type].set(room, {
          resolve,
          reject,
          timeout: setTimeout(() => {
            log.trace(userSession.getPublicInfo(), WAIT_RECONNECTION_ABANDON_DEBUG_MSG)
            reject()
            userSession.timeouts[type].delete(room)
          }, timeout + PLAYER_TIMEOUT_GRACE),
        })
      })
    },
    resolveWaitingPromises(room, type) {
      if (!type) {
        userSession.resolveWaitingPromises(room, "disconnection")
        userSession.resolveWaitingPromises(room, "turn")
        return
      }

      const reconnecTimeout = userSession.timeouts[type].get(room)

      if (!reconnecTimeout) {
        return
      }

      const { timeout, resolve } = reconnecTimeout

      if (resolve) {
        resolve()
      }

      if (timeout) {
        clearTimeout(timeout)
      }

      userSession.timeouts[type].delete(room)
    },
    reconnect(room, type) {
      userSession.resolveWaitingPromises(room, type)
      userSession.connect()
    },
    connect() {
      userSession.online = true
    },
    disconnect() {
      log.debug(userSession.getUserData(), "Session disconnected")
      userSession.online = false
    },
    setName(id) {
      userSession.name = id
    },
  }

  return userSession
}
