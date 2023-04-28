import logger from "../../etc/logger"
import { PLAYER_ABANDON_TIMEOUT, PLAYER_TIMEOUT_GRACE } from "../constants"

export interface IUser {
  key: string
  id: string
  session: string
  online: boolean
  ownedMatches: Set<string>
  reconnectTimeouts: Map<string, NodeJS.Timeout | null>
  reconnectPromises: Map<string, () => void> // room (matchId), resolver promise
  getPublicUser(): Omit<IUser, "session">
  waitReconnection(room: string, timeout?: number): Promise<void>
  resolveWaitingPromises(room: string): void
  connect(): void
  disconnect(): void
  reconnect(room: string): void
  setId(id: string): void
}

const WAIT_RECONNECTION_ABANDON_DEBUG_MSG = `User disconnected from match or was inactive and timed out with no reconnection`

export interface ISocketMatchState {
  isWaitingForPlay: boolean
  isWaitingForSay: boolean
}

export function User(key: string, id: string, session: string) {
  const user: IUser = {
    id,
    key,
    session,
    online: true,
    ownedMatches: new Set(),
    reconnectTimeouts: new Map(),
    reconnectPromises: new Map(),
    getPublicUser() {
      const { session: _session, ...rest } = user
      return rest
    },
    waitReconnection(room, timeout = PLAYER_ABANDON_TIMEOUT) {
      return new Promise<void>((resolve, reject) => {
        user.resolveWaitingPromises(room)
        logger.debug(user.getPublicUser(),  `User disconnected or left, waiting for ${timeout}ms to reconnect`)
        user.reconnectTimeouts.set(
          room,
          setTimeout(() => {
            logger.debug(user.getPublicUser(), WAIT_RECONNECTION_ABANDON_DEBUG_MSG)
            reject()
            user.reconnectPromises.delete(room)
          }, timeout + PLAYER_TIMEOUT_GRACE)
        )
        user.reconnectPromises.set(room, resolve)
      })
    },
    resolveWaitingPromises(room) {
      const promise = user.reconnectPromises.get(room)
      if (promise) {
        promise()
        user.reconnectPromises.delete(room)
      }

      const timeout = user.reconnectTimeouts.get(room)
      if (timeout) {
        clearTimeout(timeout)
        user.reconnectTimeouts.delete(room)
      }
    },
    reconnect(room) {
      user.resolveWaitingPromises(room)
      user.connect()
    },
    connect() {
      user.online = true
    },
    // @TODO Disconect when all sockets disconnect
    disconnect() {
      user.online = false
    },
    setId(id) {
      user.id = id
    },
  }

  return user
}
