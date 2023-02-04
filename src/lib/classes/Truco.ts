import { ESayCommand } from "../../types"
import { IPlayer } from "./Player"
import { ITeam } from "./Team"

export interface ITruco {
  state: 1 | 2 | 3 | 4
  teamIdx: 0 | 1 | null
  answer: boolean | null
  turn: number
  teams: [ITeam, ITeam]
  players: Array<IPlayer>
  currentPlayer: IPlayer | null
  generator: Generator<ITruco, void, unknown>
  sayTruco(player: IPlayer, callback: () => void): ITruco
  sayAnswer(player: IPlayer, answer: boolean | null, callback: () => void): ITruco
  setTurn(turn: number): number
  setTeam(idx: 0 | 1): 0 | 1
  setCurrentPlayer(player: IPlayer | null): IPlayer | null
  getNextPlayer(): IteratorResult<ITruco, ITruco | void>
}

export function Truco(teams: [ITeam, ITeam]) {
  function* trucoAnswerGeneratorSequence() {
    let i = 0
    while (i < truco.players.length && truco.answer === null) {
      const player = truco.players[truco.turn]
      truco.setCurrentPlayer(player)
      if (player.disabled || !player.ready) {
        truco.setCurrentPlayer(null)
      }

      if (truco.turn >= truco.players.length - 1) {
        truco.setTurn(0)
      } else {
        truco.setTurn(truco.turn + 1)
      }

      i++

      yield truco
    }
    yield truco
  }

  const truco: ITruco = {
    turn: 0,
    state: 1,
    teams,
    teamIdx: null,
    answer: null,
    currentPlayer: null,
    generator: trucoAnswerGeneratorSequence(),
    players: [],
    sayTruco(player, callback) {
      if (truco.state === 4) {
        return truco
      }
      const playerTeamIdx = player.teamIdx as 0 | 1
      const teamIdx = truco.teamIdx
      if (teamIdx === null || teamIdx !== playerTeamIdx) {
        truco.state++
        const opponentIdx = Number(!playerTeamIdx) as 0 | 1
        truco.teamIdx = playerTeamIdx
        truco.answer = null
        truco.players = teams[opponentIdx].players
        truco.generator = trucoAnswerGeneratorSequence()

        teams[playerTeamIdx].players.forEach((player) => {
          player._commands.delete(ESayCommand.TRUCO)
          player._commands.delete(ESayCommand.QUIERO)
          player._commands.delete(ESayCommand.NO_QUIERO)
        })
        teams[opponentIdx].players.forEach((player) => {
          if (truco.state < 4) {
            player._commands.add(ESayCommand.TRUCO)
          } else {
            player._commands.delete(ESayCommand.TRUCO)
          }
          player._commands.add(ESayCommand.QUIERO)
          player._commands.add(ESayCommand.NO_QUIERO)
        })

        callback()
        return truco
      }
      return truco
    },
    sayAnswer(player, answer, callback) {
      const opponentIdx = Number(!player.teamIdx) as 0 | 1
      if (player.teamIdx === truco.teamIdx) {
        return truco
      }
      if (answer) {
        teams[player.teamIdx].players.forEach((player) => {
          player._commands.add(ESayCommand.TRUCO)
          player._commands.delete(ESayCommand.NO_QUIERO)
          player._commands.delete(ESayCommand.QUIERO)
          if (truco.state > 3) {
            player._commands.delete(ESayCommand.TRUCO)
          }
        })
        teams[opponentIdx].players.forEach((player) => {
          player._commands.delete(ESayCommand.TRUCO)
        })
      }
      if (answer === false) {
        truco.state--
        const playerTeam = teams[player.teamIdx]
        playerTeam.players.forEach((player) => playerTeam.disable(player))
        teams[player.teamIdx].players.forEach((player) => {
          player._commands.delete(ESayCommand.QUIERO)
          player._commands.delete(ESayCommand.TRUCO)
          player._commands.delete(ESayCommand.NO_QUIERO)
        })
      }
      if (answer !== null) {
        truco.teamIdx = Number(!player.teamIdx) as 0 | 1
        truco.answer = answer
        callback()
      }
      return truco
    },
    setTeam(idx: 0 | 1) {
      truco.teamIdx = idx
      return truco.teamIdx
    },
    setTurn(turn) {
      truco.turn = turn
      return truco.turn
    },
    setCurrentPlayer(player) {
      truco.currentPlayer = player
      return truco.currentPlayer
    },
    getNextPlayer() {
      return truco.generator.next()
    },
  }

  teams.forEach((team) =>
    team.players.forEach((player) => {
      player._commands.add(ESayCommand.TRUCO)
    })
  )
  return truco
}
