import { ECommand, ETrucoCommand, IPlayer, ITeam } from "../../types"

interface IPlayerCurrentCommands {
  player: IPlayer
  add: Array<ECommand>
  del: Array<ECommand>
}

export interface ITruco {
  state: 1 | 2 | 3 | 4
  teamIdx: 0 | 1 | null
  waitingAnswer: boolean
  answer: boolean | null
  turn: number
  teams: [ITeam, ITeam]
  players: Array<IPlayer>
  currentCommands: Array<IPlayerCurrentCommands>
  currentPlayer: IPlayer | null
  generator: Generator<ITruco, void, unknown>
  sayTruco(player: IPlayer): ITruco
  sayAnswer(player: IPlayer, answer: boolean | null): ITruco
  setTurn(turn: number): number
  setTeam(idx: 0 | 1): 0 | 1
  getNextTrucoCommand(): ETrucoCommand | null
  setCurrentPlayer(player: IPlayer | null): IPlayer | null
  getNextPlayer(): IteratorResult<ITruco, ITruco | void>
  reset(): void
}

const EMPTY_TRUCO: Pick<
  ITruco,
  "turn" | "teamIdx" | "answer" | "waitingAnswer" | "currentPlayer" | "players"
> = {
  turn: 0,
  teamIdx: null,
  answer: null,
  waitingAnswer: false,
  currentPlayer: null,
  players: [],
}

const TRUCO_STATE_MAP = {
  1: ETrucoCommand.TRUCO,
  2: ETrucoCommand.RE_TRUCO,
  3: ETrucoCommand.VALE_CUATRO,
  4: null,
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
    ...EMPTY_TRUCO,
    state: 1,
    teams,
    currentCommands: [],
    generator: trucoAnswerGeneratorSequence(),
    getNextTrucoCommand() {
      return TRUCO_STATE_MAP[truco.state]
    },
    reset() {
      Object.assign(truco, EMPTY_TRUCO)
    },
    sayTruco(player) {
      if (truco.state === 4) {
        return truco
      }
      truco.turn = 0
      const playerTeamIdx = player.teamIdx as 0 | 1
      const teamIdx = truco.teamIdx
      if (teamIdx === null || teamIdx !== playerTeamIdx) {
        truco.waitingAnswer = true
        truco.state++
        const opponentIdx = Number(!playerTeamIdx) as 0 | 1
        truco.teamIdx = playerTeamIdx
        truco.answer = null
        truco.players = teams[opponentIdx].players
        truco.generator = trucoAnswerGeneratorSequence()

        return truco
      }
      return truco
    },
    sayAnswer(player, answer) {
      if (player.teamIdx === truco.teamIdx) {
        return truco
      }
      if (answer !== null) {
        truco.currentCommands = []
        if (answer === false) {
          truco.state--
          const playerTeam = teams[player.teamIdx]
          playerTeam.players.forEach((player) => playerTeam.disable(player))
        }
        truco.waitingAnswer = false
        truco.answer = answer
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

  return truco
}
