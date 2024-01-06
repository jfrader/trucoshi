import { PrismaClient, User } from "@prisma/client"
import logger from "../../utils/logger"

export type CreateUserData = Pick<User, "accountId">


export const userRepository = (client: PrismaClient) => {
  const createUser = async ({ accountId }: User) => {
    try {
      const user = await client.user.create({
        data: {
          accountId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })

      return { success: true, user }
    } catch (e) {
      logger.debug(e, "Error creating user")
      return { success: false, session: null }
    }
  }

  return { createUser }
}

export type IUserRepository = ReturnType<typeof userRepository>
