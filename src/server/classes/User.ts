import { PLAYER_ABANDON_TIMEOUT } from "../constants"

export interface IUser {
  key: string
  id: string
  session: string
  online: boolean
  ownedMatches: Set<string>
  waitingTimeouts: Map<string, NodeJS.Timeout | null>
  waitingPromises: Map<string, () => void> // room (matchId), resolver promise
  waitReconnection(room: string, reconnect: () => void, abandon: () => void): void
  connect(): void
  disconnect(): void
  reconnect(room: string): void
  setId(id: string): void
}

export function User(key: string, id: string, session: string) {
  const user: IUser = {
    id,
    key,
    session,
    online: true,
    ownedMatches: new Set(),
    waitingTimeouts: new Map(),
    waitingPromises: new Map(),
    waitReconnection(room, reconnect, abandon) {
      user.waitingTimeouts.set(
        room,
        setTimeout(() => {
          abandon()
          user.waitingPromises.delete(room)
        }, PLAYER_ABANDON_TIMEOUT)
      )
      user.waitingPromises.set(room, reconnect)
    },
    reconnect(room) {
      const promise = user.waitingPromises.get(room)
      if (promise) {
        promise()
        user.waitingPromises.delete(room)
      }

      const timeout = user.waitingTimeouts.get(room)
      if (timeout) {
        clearTimeout(timeout)
        user.waitingTimeouts.delete(room)
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
