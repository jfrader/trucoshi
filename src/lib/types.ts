import { IPlayer } from "./classes/Player"
import { ITeam } from "./classes/Team"

export enum ESayCommand {
  QUIERO = "QUIERO",
  NO_QUIERO = "NO_QUIERO",
  TRUCO = "TRUCO",
  MAZO = "MAZO",
  FLOR = "FLOR",
  CONTRAFLOR = "CONTRAFLOR",
}

export enum EEnvidoCommand {
  ENVIDO = "ENVIDO",
  ENVIDO_ENVIDO = "ENVIDO_ENVIDO",
  REAL_ENVIDO = "REAL_ENVIDO",
  FALTA_ENVIDO = "FALTA_ENVIDO",
}

export enum EHandState {
  WAITING_PLAY = "WAITING_PLAY",
  WAITING_FOR_TRUCO_ANSWER = "WAITING_FOR_TRUCO_ANSWER",
  WAITING_ENVIDO_ANSWER = "WAITING_ENVIDO_ANSWER",
  FINISHED = "FINISHED",
}

export type ECommand = ESayCommand | EEnvidoCommand

export enum GAME_ERROR {
  MATCH_ALREADY_STARTED = "MATCH_ALREADY_STARTED",
  LOBBY_IS_FULL = "LOBBY_IS_FULL",
  UNEXPECTED_TEAM_SIZE = "UNEXPECTED_TEAM_SIZE",
  TEAM_NOT_READY = "TEAM_NOT_READY",
  TEAM_IS_FULL = "TEAM_IS_FULL",
}

export interface EnvidoState {
  accept: number
  decline: number
  teamIdx: 0 | 1 | null
}

export type IHandCommands = {
  [key in ECommand]: (player: IPlayer) => void
}

export type IEnvidoCalculatorResult = {
  accept: number
  decline: number
  next: Array<ECommand>
}

export type IEnvidoCalculatorArgs = {
  teams: [ITeam, ITeam]
  matchPoint: number
}

export type IEnvidoCalculator = {
  [key in EEnvidoCommand]: (args?: IEnvidoCalculatorArgs) => IEnvidoCalculatorResult
}
