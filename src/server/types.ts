import { Socket } from "socket.io"
import { IUser } from "./classes/user"

export enum EClientEvent {
  PING = "PING",
  CREATE_MATCH = "CREATE_MATCH",
  JOIN_MATCH = "JOIN_MATCH",
  START_MATCH = "START_MATCH",
  SET_USER_ID = "SET_USER_ID",
  SET_SESSION = "SET_SESSION",
}

export enum EServerEvent {
  PONG = "PONG",
}

export interface TrucoshiSocket extends Socket {
  user?: IUser
}
