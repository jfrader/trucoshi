export enum EClientEvent {
  PING = "PING",
  CREATE_MATCH = "CREATE_MATCH",
  JOIN_MATCH = "JOIN_MATCH",
  START_MATCH = "START_MATCH",
  SET_PLAYER_ID = "SET_PLAYER_ID",
}

export enum EServerEvent {
  SET_SESSION_ID = "SET_SESSION_ID",
  PONG = "PONG",
}
