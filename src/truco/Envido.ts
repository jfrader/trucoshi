import { ITable } from "../lib"
import { getMaxNumberIndex } from "../lib/utils"
import {
  EAnswerCommand,
  ECommand,
  EEnvidoCommand,
  GAME_ERROR,
  IEnvidoCalculator,
  ILobbyOptions,
  IPlayer,
  ITeam,
} from "../types"
import logger from "../utils/logger"

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
  winningPointsAnswer: number
  turn: number
  winningPlayer: IPlayer | null
  winner: ITeam | null
  teams: [ITeam, ITeam]
  players: Array<IPlayer>
  currentPlayer: IPlayer | null
  getPointsToGive(): number
  sayPoints(player: IPlayer, points: number): IEnvido
  sayEnvido(command: EEnvidoCommand, player: IPlayer): IEnvido
  sayAnswer(player: IPlayer, answer: boolean | null): IEnvido
  setTurn(turn: number): number
  setTeam(idx: 0 | 1): 0 | 1
  setCurrentPlayer(player: IPlayer | null): IPlayer | null
  getNextPlayer(): IteratorResult<IEnvido, IEnvido | void>
}

const log = logger.child({ class: "Envido" })

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
    if (!args || !args.teams || !args.options) {
      throw new Error("Envido calculator arguments are undefined")
    }
    const {
      teams,
      options: { matchPoint, faltaEnvido },
    } = args
    const totals = teams.map((team) => team.points.malas + team.points.buenas)
    const higher = getMaxNumberIndex(totals)
    const points = teams[higher].points
    const next = [EAnswerCommand.QUIERO, EAnswerCommand.NO_QUIERO]
    const accept = 0
    const decline = 1

    if (faltaEnvido === 2) {
      const replace =
        points.buenas > 0 || points.malas === matchPoint
          ? matchPoint - points.buenas
          : matchPoint - points.malas

      return {
        accept,
        decline,
        replace,
        next,
      }
    }

    const replace = matchPoint * 2 - totals[higher]
    return {
      accept,
      decline,
      replace,
      next,
    }
  },
}

function* envidoTurnGeneratorSequence(envido: IEnvido) {
  while (envido.answer === null || envido.winner === null) {
    let player = envido.players[envido.turn]

    if (envido.turn >= envido.players.length - 1) {
      envido.setTurn(0)
    } else {
      envido.setTurn(envido.turn + 1)
    }

    envido.setCurrentPlayer(player)
    if (player.disabled) {
      envido.setCurrentPlayer(null)
    }

    yield envido
  }
  envido.setCurrentPlayer(null)
  yield envido
}

export function Envido(teams: [ITeam, ITeam], options: ILobbyOptions, table: ITable) {
  const envido: IEnvido = {
    ...EMPTY_ENVIDO,
    started: false,
    finished: false,
    answered: false,
    accepted: false,
    possibleAnswerCommands: Object.values(EEnvidoCommand),
    declineStake: 0,
    winningPointsAnswer: -1,
    winner: null,
    stake: 0,
    teams,
    getPointsToGive() {
      if (!envido.winner) {
        return 0
      }

      if (envido.answer === false) {
        return envido.declineStake
      }

      return envido.stake
    },
    sayEnvido(command, player) {
      const playerTeamIdx = player.teamIdx as 0 | 1
      if (envido.teamIdx !== playerTeamIdx && envido.possibleAnswerCommands.includes(command)) {
        const opponentIdx = Number(!playerTeamIdx) as 0 | 1

        const { accept, decline, replace, next } = EnvidoCalculator[command]({
          stake: envido.stake,
          declineStake: envido.declineStake,
          teams,
          options,
        })

        envido.teamIdx = playerTeamIdx
        envido.stake += accept
        envido.declineStake += decline
        envido.players = [...teams[opponentIdx].players].sort((a, b) =>
          a.hasFlor && !a.hasSaidFlor ? -1 : b.hasFlor && !b.hasSaidFlor ? 1 : 0
        )
        envido.started = true
        envido.answered = false

        turnGenerator = envidoTurnGeneratorSequence(envido)
        teams[player.teamIdx].resetPassed()

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

      log.trace(
        {
          playerKey: player.key,
          points,
          currentWinningPlayer: envido.winningPlayer?.key,
          currentWinningPoints: envido.winningPointsAnswer,
        },
        "sayPoints called"
      )

      player.saidEnvidoPoints()

      if (!envido.winningPlayer || envido.winningPointsAnswer === -1) {
        envido.winningPlayer = player
        envido.winningPointsAnswer = points
        log.trace({ playerKey: player.key, points }, "Set as first winning player")
      } else {
        envido.turn = 0
        if (points > envido.winningPointsAnswer) {
          envido.winningPlayer = player
          envido.winningPointsAnswer = points
          envido.players = teams[Number(!player.teamIdx)].activePlayers.filter(
            (p) => !p.hasSaidEnvidoPoints
          )
          log.trace({ playerKey: player.key, points }, "New winning player due to higher points")
        } else if (points === envido.winningPointsAnswer) {
          const playerPos = table.getPlayerPosition(player.key, true)
          const currentWinnerPos = table.getPlayerPosition(envido.winningPlayer.key, true)
          const forehandWinner = playerPos < currentWinnerPos ? player : envido.winningPlayer
          log.trace(
            {
              playerKey: player.key,
              playerPos,
              currentWinnerKey: envido.winningPlayer.key,
              currentWinnerPos,
              forehandWinnerKey: forehandWinner.key,
              forehandIdx: table.forehandIdx,
              reorderedPlayers: table.getPlayersForehandFirst().map((p) => p.key),
            },
            "Tie detected, selecting forehand winner"
          )
          envido.players = teams[Number(!forehandWinner.teamIdx)].activePlayers.filter(
            (p) => !p.hasSaidEnvidoPoints
          )
          envido.winningPlayer = forehandWinner
        } else {
          envido.players = teams[player.teamIdx].activePlayers.filter((p) => !p.hasSaidEnvidoPoints)
        }
      }

      const winningPlayerTeamIdx = envido.winningPlayer.teamIdx as 0 | 1
      const loosingTeamIdx = Number(!winningPlayerTeamIdx) as 0 | 1

      if (envido.teams[loosingTeamIdx].players.every((p) => p.hasSaidEnvidoPoints || p.disabled)) {
        envido.teams.forEach((team) => team.resetPassed())
        envido.finished = true
        envido.winner = teams[envido.winningPlayer.teamIdx]
        log.trace(
          { winningTeamIdx: envido.winningPlayer.teamIdx, winnerKey: envido.winningPlayer.key },
          "Envido finished, winner set"
        )
      }

      return envido
    },
    sayAnswer(player, answer) {
      const opponentIdx = Number(!player.teamIdx) as 0 | 1
      if (answer === null || player.teamIdx === envido.teamIdx) {
        return envido
      }
      if (answer === true) {
        envido.accepted = true
        envido.turn = 0
        envido.players = table.getPlayersForehandFirst()

        turnGenerator = envidoTurnGeneratorSequence(envido)
      }
      if (answer === false) {
        envido.finished = true
        const opponentTeam = teams[opponentIdx]
        envido.winner = opponentTeam
      }

      teams[player.teamIdx].resetPassed()

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
      return turnGenerator.next()
    },
  }

  let turnGenerator = envidoTurnGeneratorSequence(envido)

  return envido
}
