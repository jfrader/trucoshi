import { EEnvidoCommand, IEnvidoCalculator } from "../types"
import { getMaxNumberIndex } from "./utils"

export const CARDS = {
  "1e": 14,
  "1b": 13,
  "7e": 12,
  "7o": 11,
  "3e": 10,
  "3o": 10,
  "3b": 10,
  "3c": 10,
  "2e": 9,
  "2o": 9,
  "2b": 8,
  "2c": 8,
  "1o": 7,
  "1c": 7,
  re: 6,
  ro: 6,
  rb: 6,
  rc: 6,
  ce: 5,
  co: 5,
  cb: 5,
  cc: 5,
  pe: 4,
  po: 4,
  pb: 4,
  pc: 4,
  "7b": 3,
  "7c": 3,
  "6e": 2,
  "6o": 2,
  "6b": 2,
  "6c": 2,
  "5e": 1,
  "5o": 1,
  "5b": 1,
  "5c": 1,
  "4e": 0,
  "4o": 0,
  "4b": 0,
  "4c": 0,
}

export const TEAM_SIZE_VALUES = [1, 2, 3]

export const EnvidoCalculator: IEnvidoCalculator = {
  [EEnvidoCommand.ENVIDO]: () => ({
    accept: 2,
    decline: 1,
    next: [EEnvidoCommand.ENVIDO_ENVIDO, EEnvidoCommand.REAL_ENVIDO, EEnvidoCommand.FALTA_ENVIDO],
  }),
  [EEnvidoCommand.ENVIDO_ENVIDO]: () => ({
    accept: 4,
    decline: 2,
    next: [EEnvidoCommand.REAL_ENVIDO, EEnvidoCommand.FALTA_ENVIDO],
  }),
  [EEnvidoCommand.REAL_ENVIDO]: () => ({
    accept: 3,
    decline: 1,
    next: [EEnvidoCommand.FALTA_ENVIDO],
  }),
  [EEnvidoCommand.FALTA_ENVIDO]: (args) => {
    if (!args || !args.teams || !args.matchPoint) {
      return {
        accept: 1,
        decline: 1,
        next: [],
      }
    }
    const { teams, matchPoint } = args
    const totals = teams.map((team) => team.points.malas + team.points.buenas)
    const higher = getMaxNumberIndex(totals)
    const points = teams[higher].points
    const accept = points.buenas > 0 ? matchPoint - points.buenas : matchPoint - points.malas
    return {
      accept,
      decline: 2,
      next: [],
    }
  },
}
