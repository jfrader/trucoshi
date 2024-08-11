import { SocketError } from "../server"
import { IPlayer, ITeam, EFlorCommand } from "../types"

export interface IFlor {
  turn: number
  finished: boolean
  players: IPlayer[]
  candidates: IPlayer[]
  winners: Array<{ player: IPlayer; points: number }>
  currentPlayer: IPlayer | null
  setTurn(turn: number): void
  setCurrentPlayer(player: IPlayer | null): void
  sayFlor(player: IPlayer): IFlor
  sayContraflor(player: IPlayer): IFlor
  sayAchico(player: IPlayer): IFlor
  getNextPlayer(): void
}

function* florTurnGeneratorSequence(flor: IFlor) {
  while (flor.winners.length === 0) {
    const player = flor.players[flor.turn]
    flor.setCurrentPlayer(player)
    if (player.disabled) {
      flor.setCurrentPlayer(null)
    }

    if (flor.turn >= flor.players.length - 1) {
      flor.setTurn(0)
    } else {
      flor.setTurn(flor.turn + 1)
    }

    yield flor
  }
  flor.setCurrentPlayer(null)
  yield flor
}

export function Flor(teams: [ITeam, ITeam]) {
  const flor: IFlor = {
    turn: 0,
    finished: false,
    currentPlayer: null,
    players: [],
    candidates: [],
    winners: [],
    setTurn(turn) {
      flor.turn = turn
    },
    setCurrentPlayer(player) {
      flor.currentPlayer = player
    },
    sayFlor(player) {
      if (!player.hasFlor) {
        throw new SocketError("FORBIDDEN")
      }
      
      const playerTeamIdx = player.teamIdx as 0 | 1        
      
      const opponentIdx = Number(!playerTeamIdx) as 0 | 1



      flor.candidates.push(player);

      return flor
    },
    sayAchico() {
      return flor
    },
    sayContraflor(player) {
      if (!player.hasFlor) {
        throw new SocketError("FORBIDDEN")
      }

      const playerTeamIdx = player.teamIdx as 0 | 1
      const opponentIdx = Number(!playerTeamIdx) as 0 | 1

      flor.players = teams[opponentIdx].players

      return flor
    },
    getNextPlayer() {
      generator.next()
    },
  }

  const generator = florTurnGeneratorSequence(flor)

  return flor
}
