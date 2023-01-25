import { ITruco } from "../types"

export function Truco() {
  function* trucoAnswerGeneratorSequence() {
    let i = 0
    while (i < truco.players.length && truco.answer === null) {
      const player = truco.players[truco.turn]
      truco.setCurrentPlayer(player)
      if (player.disabled) {
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
    teamIdx: null,
    answer: null,
    currentPlayer: null,
    generator: trucoAnswerGeneratorSequence(),
    players: [],
    sayTruco(teamIdx, players) {
      truco.teamIdx = teamIdx
      truco.answer = null
      truco.players = players
      truco.generator = trucoAnswerGeneratorSequence()
      return truco
    },
    setPlayers(players) {
      truco.players = players
    },
    setAnswer(answer) {
      if (answer) {
        truco.state++
      }
      if (answer !== null) {
        truco.teamIdx = null
      }
      truco.answer = answer
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
