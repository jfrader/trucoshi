export interface IUser {
  id: string
  session: string
}

export function User(id: string, session: string) {
  const user: IUser = {
    id,
    session,
  }

  return user
}
