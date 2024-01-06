import { IChatRoom, TMap } from "../../types";
import { TrucoshiServer } from "./Trucoshi";
export interface IChat {
    rooms: TMap<string, IChatRoom>;
    create(id: string): void;
    delete(id: string): void;
}
export declare const Chat: (io: TrucoshiServer) => IChat;
