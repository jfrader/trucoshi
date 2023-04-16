import logger from "../../etc/logger"
import { PLAYER_ABANDON_TIMEOUT } from "../constants"

export interface IUser {
  key: string
  id: string
  session: string
  online: boolean
  ownedMatches: Set<string>
  reconnectTimeouts: Map<string, NodeJS.Timeout | null>
  reconnectPromises: Map<string, () => void> // room (matchId), resolver promise
  getPublicUser(): Omit<IUser, "session">
  waitReconnection(room: string, reconnect: () => void, abandon: () => void): void
  connect(): void
  disconnect(): void
  reconnect(room: string): void
  setId(id: string): void
}

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
    waitReconnection(room, reconnect, abandon) {
      logger.debug(
        user.getPublicUser(),
        `User disconnected from match, waiting for ${PLAYER_ABANDON_TIMEOUT}ms to reconnect`
      )

      user.reconnectTimeouts.set(
        room,
        setTimeout(() => {
          logger.debug(
            user.getPublicUser(),
            `User disconnected from match and timed out with no reconnection, abandoning match...`
          )
          abandon()
          user.reconnectPromises.delete(room)
        }, PLAYER_ABANDON_TIMEOUT)
      )
      user.reconnectPromises.set(room, reconnect)
    },
    reconnect(room) {
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
    connect() {
      user.online = true
    },
    disconnect() {
      user.online = false
    },
    setId(id) {
      user.id = id
    },
  }

  return user
}
