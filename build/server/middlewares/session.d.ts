import { ExtendedError } from "socket.io/dist/namespace";
import { ITrucoshi, TrucoshiSocket } from "../classes";
export declare const session: (server: ITrucoshi) => (socket: TrucoshiSocket, next: (err?: ExtendedError) => void) => void;
