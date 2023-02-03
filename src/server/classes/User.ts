export interface IUser {
  key: string
  id: string
  ownedMatchId: string | null
  matchSocketIds: Map<string, Set<string>> // matchId, socketIds[]
  setOwnedMatch(id: string): void
}

export function User(key:string, id: string) {
  const user: IUser = {
    id,
    key,
    matchSocketIds: new Map(),
    ownedMatchId: null,
    setOwnedMatch(id: string) {
      user.ownedMatchId = id
    },
  }

  return user
}
