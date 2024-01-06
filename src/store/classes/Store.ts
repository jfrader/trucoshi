import { PrismaClient } from "@prisma/client"
import { IUserRepository, userRepository } from "../repositories/user"

export interface IStore {
  client: PrismaClient
  user: IUserRepository
}

export const Store = (client: PrismaClient) => {
  const store: IStore = {
    client,
    user: userRepository(client),
  }

  return store
}
