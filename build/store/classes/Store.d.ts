import { PrismaClient } from "@prisma/client";
import { IUserRepository } from "../repositories/user";
export interface IStore {
    client: PrismaClient;
    user: IUserRepository;
}
export declare const Store: (client: PrismaClient) => IStore;
