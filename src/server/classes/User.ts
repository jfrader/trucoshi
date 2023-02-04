export interface IUser {
  key: string
  id: string
  session: string
  online: boolean
  ownedMatchId: string | null
  waitingTimeouts: Map<string, NodeJS.Timeout | null>
  waitingPromises: Map<string, () => void> // room (matchId), resolver promise
  waitReconnection(room: string, reconnect: () => void, abandon: () => void): void
  setOwnedMatch(id: string): void
  connect(): void
  disconnect(): void
  reconnect(room: string): void
  setId(id: string): void
}

const PLAYER_ABANDON_TIMEOUT = 10000

export function User(key: string, id: string, session: string) {
  const user: IUser = {
    id,
    key,
    session,
    online: true,
    ownedMatchId: null,
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
    setOwnedMatch(id: string) {
      user.ownedMatchId = id
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
