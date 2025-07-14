import { SocketError } from "../server"
import { getMinNumberIndex } from "../lib/utils"
import { EAnswerCommand, EFlorCommand, GAME_ERROR, IPlayer, ITeam, ILobbyOptions } from "../types"
import { ITable } from "../lib/classes/Table"
import logger from "../utils/logger"

export interface IFlor {
  state: number
  turn: number
  finished: boolean
  answered: boolean
  started: boolean
  accepted: boolean
  teamIdx: 0 | 1 | null
  answer: boolean | null
  winningPlayer: IPlayer | null
  winner: ITeam | null
  players: IPlayer[]
  candidates: IPlayer[]
  winners: Array<{ player: IPlayer; points: number }>
  currentPlayer: IPlayer | null
  stake: number
  declineStake: number
  possibleAnswerCommands: Array<EFlorCommand | EAnswerCommand>
  teams: [ITeam, ITeam]
  getPointsToGive(): number
  sayFlor(player: IPlayer): IFlor
  sayContraflor(player: IPlayer): IFlor
  sayContraflorAlResto(player: IPlayer): IFlor
  sayAchico(player: IPlayer): IFlor
  sayAnswer(player: IPlayer, answer: boolean): IFlor
  setTurn(turn: number): number
  setTeam(idx: 0 | 1): 0 | 1
  setCurrentPlayer(player: IPlayer | null): IPlayer | null
  getNextPlayer(): IteratorResult<IFlor, IFlor | void>
}

export function Flor(teams: [ITeam, ITeam], options: ILobbyOptions, table: ITable) {
  const flor: IFlor = {
    state: 0,
    finished: false,
    answered: false,
    started: false,
    accepted: false,
    turn: 0,
    teamIdx: null,
    answer: null,
    currentPlayer: null,
    players: [],
    candidates: [],
    winners: [],
    winningPlayer: null,
    winner: null,
    stake: 0,
    declineStake: 0,
    possibleAnswerCommands: [
      EFlorCommand.FLOR,
      EFlorCommand.CONTRAFLOR,
      EFlorCommand.CONTRAFLOR_AL_RESTO,
      EFlorCommand.ACHICO,
    ],
    teams,
    getPointsToGive() {
      if (!flor.winner) {
        return 0
      }
      if (flor.answer === false) {
        return flor.declineStake
      }
      return flor.stake
    },
    sayFlor(player) {
      if (!player.hasFlor) {
        throw new SocketError(GAME_ERROR.NO_FLOR)
      }
      const playerTeamIdx = player.teamIdx as 0 | 1
      const opponentIdx = Number(!playerTeamIdx) as 0 | 1

      player.saidFlor()
      flor.started = true

      if (flor.teamIdx === null) {
        flor.winningPlayer = player
        flor.teamIdx = playerTeamIdx
      } else if (flor.teamIdx === playerTeamIdx) {
        // Same team can say FLOR
        flor.candidates.push(player)
        // Check if all players in the team with Flor have declared
        if (
          teams[playerTeamIdx].players
            .filter((p) => p.hasFlor && !p.disabled)
            .every((p) => p.hasSaidFlor || p.usedHand.length > 0)
        ) {
          // All team players with Flor have said it, check opponents
          if (
            teams[opponentIdx].players
              .filter((p) => !p.disabled && p.hasFlor)
              .every((p) => p.hasSaidFlor || p.usedHand.length > 0)
          ) {
            flor.finished = true
            flor.winner = teams[playerTeamIdx]
            flor.stake = 3 // 3 points for unopposed Flor
            flor.declineStake = 0
            flor.answered = true
            flor.accepted = false
            return flor
          }
        }
        turnGenerator = florTurnGeneratorSequence(flor)
        return flor
      } else {
        // Opponent says FLOR, resolve immediately
        flor.candidates.push(player)
        flor.answered = true
        flor.accepted = true
        flor.stake = 4 // Accepted FLOR envite awards 4 points
        flor.declineStake = 3
        // Calculate points for all candidates
        flor.winners = flor.candidates.map((p) => ({
          player: p,
          points: p.flor?.value || 0,
        }))
        // Determine winner
        let maxPoints = -1
        let winningPlayer: IPlayer | null = null
        for (const { player: p, points: pts } of flor.winners) {
          if (pts > maxPoints) {
            maxPoints = pts
            winningPlayer = p
          } else if (pts === maxPoints && winningPlayer && p) {
            // Tiebreaker: forehand player wins
            const currentPos = table.getPlayerPosition(p.key, true)
            const winningPos = table.getPlayerPosition(winningPlayer.key, true)
            if (currentPos < winningPos) {
              winningPlayer = p
            }
          }
        }
        flor.winningPlayer = winningPlayer

        // Check if all players in the team with Flor have declared
        if (
          teams[playerTeamIdx].players
            .filter((p) => p.hasFlor && !p.disabled)
            .every((p) => p.hasSaidFlor || p.usedHand.length > 0)
        ) {
          // All team players with Flor have said it, check opponents
          if (
            teams[opponentIdx].players
              .filter((p) => !p.disabled && p.hasFlor)
              .every((p) => p.hasSaidFlor || p.usedHand.length > 0)
          ) {
            flor.winner = winningPlayer ? teams[winningPlayer.teamIdx] : null
            flor.finished = true
            return flor
          }
        }

        turnGenerator = florTurnGeneratorSequence(flor)
        return flor
      }

      flor.stake = 3
      flor.declineStake = 0
      flor.players = table.getPlayersForehandFirst().filter((p) => p.hasFlor && !p.hasSaidFlor)
      flor.candidates.push(player)
      flor.state = 3
      flor.accepted = false

      if (flor.players.length > 0) {
        flor.answered = false
        flor.possibleAnswerCommands = [
          EFlorCommand.CONTRAFLOR,
          EFlorCommand.CONTRAFLOR_AL_RESTO,
          EFlorCommand.FLOR,
          EFlorCommand.ACHICO,
        ]
      } else {
        flor.winner = teams[player.teamIdx]
        flor.finished = true
        flor.answered = true
      }

      turnGenerator = florTurnGeneratorSequence(flor)
      return flor
    },
    sayContraflor(player) {
      if (!player.hasFlor || flor.state !== 3) {
        throw new SocketError(GAME_ERROR.NO_FLOR)
      }
      const playerTeamIdx = player.teamIdx as 0 | 1
      if (playerTeamIdx === flor.teamIdx) {
        throw new SocketError(GAME_ERROR.INVALID_COMAND)
      }

      player.saidFlor()

      const opponentIdx = Number(!playerTeamIdx) as 0 | 1

      flor.stake = 6
      flor.declineStake = 4 // Declining CONTRAFLOR gives 4 points
      flor.teamIdx = playerTeamIdx
      flor.players = teams[opponentIdx].players.filter((p) => !p.disabled && p.hasFlor)
      flor.candidates.push(player)
      flor.state = 4

      if (flor.players.length > 0) {
        flor.answered = false
        flor.possibleAnswerCommands = [EAnswerCommand.QUIERO, EAnswerCommand.NO_QUIERO]
      } else {
        flor.finished = true
        flor.answered = true
      }

      turnGenerator = florTurnGeneratorSequence(flor)
      return flor
    },
    sayContraflorAlResto(player) {
      if (!player.hasFlor || flor.state !== 3) {
        throw new SocketError(GAME_ERROR.NO_FLOR)
      }
      const playerTeamIdx = player.teamIdx as 0 | 1
      if (playerTeamIdx === flor.teamIdx) {
        throw new SocketError(GAME_ERROR.INVALID_COMAND)
      }

      player.saidFlor()

      const opponentIdx = Number(!playerTeamIdx) as 0 | 1

      const totals = teams.map((team) => team.points.malas + team.points.buenas)
      const lower = getMinNumberIndex(totals)
      const replace = options.matchPoint * 2 - totals[lower]

      flor.stake = replace
      flor.declineStake = 6
      flor.teamIdx = playerTeamIdx
      flor.players = teams[opponentIdx].players.filter((p) => !p.disabled && p.hasFlor)
      flor.candidates.push(player)
      flor.state = 5

      if (flor.players.length > 0) {
        flor.answered = false
        flor.possibleAnswerCommands = [EAnswerCommand.QUIERO, EAnswerCommand.NO_QUIERO]
      } else {
        flor.finished = true
        flor.answered = true
      }

      turnGenerator = florTurnGeneratorSequence(flor)
      return flor
    },
    sayAchico(player) {
      if (!player.hasFlor) {
        throw new SocketError(GAME_ERROR.NO_FLOR)
      }
      player.saidFlor()
      flor.finished = true
      flor.winner = teams[Number(!player.teamIdx)]
      flor.stake = 3
      flor.declineStake = flor.state === 4 ? 4 : flor.state === 5 ? 6 : 3
      flor.answered = true
      flor.accepted = false
      return flor
    },
    sayAnswer(player, answer) {
      const playerTeamIdx = player.teamIdx as 0 | 1
      const opponentIdx = Number(!playerTeamIdx) as 0 | 1
      if (playerTeamIdx === flor.teamIdx) {
        throw new SocketError(GAME_ERROR.INVALID_COMAND)
      }
      if (flor.state < 4) {
        throw new SocketError(GAME_ERROR.INVALID_COMAND)
      }

      flor.answered = true
      flor.answer = answer
      flor.teamIdx = opponentIdx

      if (answer) {
        player.saidFlor()
        flor.accepted = true
        flor.stake = flor.state === 4 ? 6 : flor.state === 5 ? flor.stake : 4
        // Calculate points for all candidates
        flor.winners = flor.candidates.map((p) => ({
          player: p,
          points: p.flor?.value || 0,
        }))
        // Determine winner
        let maxPoints = -1
        let winningPlayer: IPlayer | null = null
        for (const { player: p, points: pts } of flor.winners) {
          if (pts > maxPoints) {
            maxPoints = pts
            winningPlayer = p
          } else if (pts === maxPoints && winningPlayer && p) {
            // Tiebreaker: forehand player wins
            const currentPos = table.getPlayerPosition(p.key, true)
            const winningPos = table.getPlayerPosition(winningPlayer.key, true)
            if (currentPos < winningPos) {
              winningPlayer = p
            }
          }
        }
        flor.winningPlayer = winningPlayer
        flor.winner = winningPlayer ? teams[winningPlayer.teamIdx] : null
        flor.finished = true
      } else {
        flor.finished = true
        flor.winner = teams[opponentIdx]
      }

      return flor
    },
    setTurn(turn) {
      flor.turn = turn
      return flor.turn
    },
    setTeam(idx) {
      flor.teamIdx = idx
      return flor.teamIdx
    },
    setCurrentPlayer(player) {
      flor.currentPlayer = player
      return flor.currentPlayer
    },
    getNextPlayer() {
      return turnGenerator.next()
    },
  }

  let turnGenerator = florTurnGeneratorSequence(flor)

  return flor
}

function* florTurnGeneratorSequence(flor: IFlor) {
  while (!flor.finished && !flor.winner) {
    const player = flor.players[flor.turn]

    if (flor.turn >= flor.players.length - 1) {
      flor.setTurn(0)
    } else {
      flor.setTurn(flor.turn + 1)
    }

    flor.setCurrentPlayer(player)
    if (player?.disabled) {
      flor.setCurrentPlayer(null)
    }

    yield flor
  }
  flor.setCurrentPlayer(null)
  yield flor
}
