import {
  EAnswerCommand,
  ECommand,
  EEnvidoCommand,
  GAME_ERROR,
  IEnvidoCalculator,
} from "../../types"
import { getMaxNumberIndex } from "../utils"
import { IPlayer } from "./Player"
import { ITable } from "./Table"
import { ITeam } from "./Team"

export interface IEnvido {
  started: boolean
  accepted: boolean
  answered: boolean
  finished: boolean
  possibleAnswerCommands: Array<ECommand>
  stake: number
  declineStake: number
  teamIdx: 0 | 1 | null
  answer: boolean | null
  pointAnswersCount: number
  winningPointsAnswer: number
  turn: number
  winningPlayer: IPlayer | null
  winner: ITeam | null
  teams: [ITeam, ITeam]
  players: Array<IPlayer>
  currentPlayer: IPlayer | null
  generator: Generator<IEnvido, void, unknown>
  sayPoints(player: IPlayer, points: number): IEnvido
  sayEnvido(command: EEnvidoCommand, player: IPlayer): IEnvido
  sayAnswer(player: IPlayer, answer: boolean | null): IEnvido
  setTurn(turn: number): number
  setTeam(idx: 0 | 1): 0 | 1
  setCurrentPlayer(player: IPlayer | null): IPlayer | null
  getNextPlayer(): IteratorResult<IEnvido, IEnvido | void>
}

const EMPTY_ENVIDO: Pick<
  IEnvido,
  "turn" | "teamIdx" | "answer" | "currentPlayer" | "players" | "winningPlayer"
> = {
  turn: 0,
  teamIdx: null,
  answer: null,
  winningPlayer: null,
  currentPlayer: null,
  players: [],
}

export const EnvidoCalculator: IEnvidoCalculator = {
  [EEnvidoCommand.ENVIDO]: (args) => {
    if (!args || args.stake === undefined || args.declineStake === undefined) {
      throw new Error("Envido calculator arguments are undefined")
    }

    const next = [
      EEnvidoCommand.REAL_ENVIDO,
      EEnvidoCommand.FALTA_ENVIDO,
      EAnswerCommand.QUIERO,
      EAnswerCommand.NO_QUIERO,
    ]

    return {
      accept: 2,
      decline: 1,
      next: args.stake < 2 ? [EEnvidoCommand.ENVIDO, ...next] : next,
    }
  },
  [EEnvidoCommand.REAL_ENVIDO]: () => ({
    accept: 3,
    decline: 1,
    next: [EEnvidoCommand.FALTA_ENVIDO, EAnswerCommand.QUIERO, EAnswerCommand.NO_QUIERO],
  }),
  [EEnvidoCommand.FALTA_ENVIDO]: (args) => {
    if (!args || !args.teams || !args.matchPoint) {
      throw new Error("Envido calculator arguments are undefined")
    }
    const { teams, matchPoint } = args
    const totals = teams.map((team) => team.points.malas + team.points.buenas)
    const higher = getMaxNumberIndex(totals)
    const points = teams[higher].points
    const accept = points.buenas > 0 ? matchPoint - points.buenas : matchPoint - points.malas
    return {
      accept: 0,
      decline: 2,
      replace: accept,
      next: [EAnswerCommand.QUIERO, EAnswerCommand.NO_QUIERO],
    }
  },
}

export function Envido(teams: [ITeam, ITeam], matchPoint: number, table: ITable) {
  function* envidoAnswerGeneratorSequence() {
    let i = 0
    while (i < envido.players.length && (envido.answer === null || envido.winner === null)) {
      const player = envido.players[envido.turn]
      envido.setCurrentPlayer(player)
      if (player.disabled || !player.ready) {
        envido.setCurrentPlayer(null)
      }

      if (envido.turn >= envido.players.length - 1) {
        envido.setTurn(0)
      } else {
        envido.setTurn(envido.turn + 1)
      }

      i++

      yield envido
    }
    envido.setCurrentPlayer(null)
    yield envido
  }

  const envido: IEnvido = {
    ...EMPTY_ENVIDO,
    started: false,
    finished: false,
    answered: false,
    accepted: false,
    possibleAnswerCommands: Object.values(EEnvidoCommand),
    declineStake: 0,
    winningPointsAnswer: 0,
    pointAnswersCount: 0,
    winner: null,
    stake: 0,
    teams,
    generator: envidoAnswerGeneratorSequence(),
    sayEnvido(command, player) {
      const playerTeamIdx = player.teamIdx as 0 | 1
      if (envido.teamIdx !== playerTeamIdx && envido.possibleAnswerCommands.includes(command)) {
        const opponentIdx = Number(!playerTeamIdx) as 0 | 1

        const { accept, decline, replace, next } = EnvidoCalculator[command]({
          stake: envido.stake,
          declineStake: envido.declineStake,
          teams,
          matchPoint,
        })

        envido.teamIdx = playerTeamIdx
        envido.stake += accept
        envido.declineStake += decline
        envido.generator = envidoAnswerGeneratorSequence()
        envido.players = teams[opponentIdx].players
        envido.started = true
        envido.answered = false

        if (replace) {
          envido.stake = replace
        }

        envido.possibleAnswerCommands = next
      }

      return envido
    },
    sayPoints(player, points) {
      if (!envido.accepted) {
        throw new Error(GAME_ERROR.ENVIDO_NOT_ACCEPTED)
      }
      if (!envido.winningPlayer || !envido.winningPointsAnswer) {
        envido.winningPlayer = player
        envido.winningPointsAnswer = points
      } else {
        if (points > envido.winningPointsAnswer) {
          envido.winningPlayer = player
          envido.winningPointsAnswer = points
        }
        if (points === envido.winningPointsAnswer) {
          const forehandWinner =
            table.getPlayerPosition(player.key, true) <
            table.getPlayerPosition(envido.winningPlayer.key, true)
              ? player
              : envido.winningPlayer

          envido.winningPlayer = forehandWinner
        }
      }

      envido.pointAnswersCount++

      if (envido.pointAnswersCount >= envido.players.length) {
        envido.finished = true
        envido.winner = teams[envido.winningPlayer.teamIdx]
      }

      return envido
    },
    sayAnswer(player, answer) {
      const opponentIdx = Number(!player.teamIdx) as 0 | 1
      if (answer === null || player.teamIdx === envido.teamIdx) {
        return envido
      }
      if (answer) {
        envido.accepted = true
        envido.generator = envidoAnswerGeneratorSequence()
        envido.turn = 0
        table.players.forEach((player) => player.calculateEnvido())
        envido.players = table.getPlayersForehandFirst()
      }
      if (answer === false) {
        envido.finished = true
        const opponentTeam = teams[opponentIdx]
        opponentTeam.addPoints(matchPoint, envido.declineStake)
        envido.winner = opponentTeam
      }
      envido.answered = true
      envido.teamIdx = opponentIdx
      envido.answer = answer
      envido.turn = 0
      return envido
    },
    setTeam(idx: 0 | 1) {
      envido.teamIdx = idx
      return envido.teamIdx
    },
    setTurn(turn) {
      envido.turn = turn
      return envido.turn
    },
    setCurrentPlayer(player) {
      envido.currentPlayer = player
      return envido.currentPlayer
    },
    getNextPlayer() {
      return envido.generator.next()
    },
  }
  return envido
}
