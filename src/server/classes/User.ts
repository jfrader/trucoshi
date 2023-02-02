export interface IUser {
  id: string
  ownedMatchId: string | null
  matchSocketIds: Map<string, Set<string>> // matchId, socketIds[]
  setOwnedMatch(id: string): void
}

export function User(id: string) {
  const user: IUser = {
    id,
    matchSocketIds: new Map(),
    ownedMatchId: null,
    setOwnedMatch(id: string) {
      user.ownedMatchId = id
    },
  }

  return user
}
