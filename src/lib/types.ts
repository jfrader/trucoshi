import { ECommand, EEnvidoCommand } from "../types"
import { IPlayer } from "./classes/Player"
import { ITeam } from "./classes/Team"

export enum EHandState {
  WAITING_PLAY = "WAITING_PLAY",
  WAITING_FOR_TRUCO_ANSWER = "WAITING_FOR_TRUCO_ANSWER",
  WAITING_ENVIDO_ANSWER = "WAITING_ENVIDO_ANSWER",
  FINISHED = "FINISHED",
}

export enum GAME_ERROR {
  MATCH_ALREADY_STARTED = "MATCH_ALREADY_STARTED",
  LOBBY_IS_FULL = "LOBBY_IS_FULL",
  UNEXPECTED_TEAM_SIZE = "UNEXPECTED_TEAM_SIZE",
  TEAM_NOT_READY = "TEAM_NOT_READY",
  TEAM_IS_FULL = "TEAM_IS_FULL",
  INVALID_ENVIDO_POINTS = "INVALID_ENVIDO_POINTS",
  ENVIDO_NOT_ACCEPTED = "ENVIDO_NOT_ACCEPTED",
  INVALID_COMAND = "INVALID_COMAND",
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
  replace?: number
  next: Array<ECommand>
}

export type IFaltaEnvidoCalculatorArgs = {
  teams: [ITeam, ITeam]
  matchPoint: number
}

export type IEnvidoCalculatorArgs = {
  stake: number
  declineStake: number
} & (IFaltaEnvidoCalculatorArgs | never)

export type IEnvidoCalculator = {
  [key in EEnvidoCommand]: (args?: IEnvidoCalculatorArgs) => IEnvidoCalculatorResult
}
