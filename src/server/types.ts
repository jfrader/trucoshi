import { Socket } from "socket.io"

export enum EClientEvent {
  PING = "PING",
  PLAY = "PLAY",
  CREATE_MATCH = "CREATE_MATCH",
  GET_MATCH = "GET_MATCH",
  JOIN_MATCH = "JOIN_MATCH",
  START_MATCH = "START_MATCH",
  SET_PLAYER_READY = "SET_PLAYER_READY",
  SET_SESSION = "SET_SESSION",
}

export enum EServerEvent {
  PONG = "PONG",
  UPDATE_MATCH = "UPDATE_MATCH",
}

export interface TrucoshiSocket extends Socket {
  session?: string
}

export enum ETrucoshiMatchState {
  UNREADY,
  STARTED,
  FINISHED,
}
