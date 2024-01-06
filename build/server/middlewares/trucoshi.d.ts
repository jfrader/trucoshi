import { ExtendedError } from "socket.io/dist/namespace";
import { ITrucoshi, TrucoshiSocket } from "../classes";
export declare const trucoshi: (server: ITrucoshi) => (socket: TrucoshiSocket, next: (err?: ExtendedError) => void) => void;
