import { PrismaClient, User } from "@prisma/client";
export type CreateUserData = Pick<User, "accountId">;
export declare const userRepository: (client: PrismaClient) => {
    createUser: ({ accountId }: User) => Promise<{
        success: boolean;
        user: User;
        session?: undefined;
    } | {
        success: boolean;
        session: null;
        user?: undefined;
    }>;
};
export type IUserRepository = ReturnType<typeof userRepository>;
