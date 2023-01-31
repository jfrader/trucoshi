export interface IUser {
  id: string
  matchSocketIds: Map<string, Set<string>> // matchId, socketIds[]
}

export function User(id: string) {
  const user: IUser = {
    id,
    matchSocketIds: new Map()
  }

  return user
}
