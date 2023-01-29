export interface IUser {
  id: string
  socketId: string
}

export function User(id: string, socketId: string) {
  const user: IUser = {
    id,
    socketId,
  }

  return user
}
