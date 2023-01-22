import {
  EEnvidoCommand,
  EHandState,
  ESayCommand,
  IDeck,
  IHand,
  IHandCommands,
  IMatch,
} from "../types"
import { checkHandWinner } from "../utils"
import { PlayInstance } from "./Play"
import { Round } from "./Round"

export function Hand(match: IMatch, deck: IDeck, idx: number) {
  match.teams.forEach((team) => {
    team.players.forEach((player) => {
      const playerHand = [deck.takeCard(), deck.takeCard(), deck.takeCard()]
      player.setHand(playerHand)
      player.enable()
      // player.setHand(["5c", "4c", "6c"])
    })
  })

  function* roundsGeneratorSequence() {
    let currentRoundIdx = 0
    let forehandTeamIdx = match.table.player(hand.turn).teamIdx as 0 | 1

    while (currentRoundIdx < 3 && !hand.finished()) {
      let i = 0

      const round = Round()
      hand.setCurrentRound(round)
      hand.pushRound(round)

      let previousRound = hand.rounds[currentRoundIdx - 1]

      // Put previous round winner as forehand
      if (previousRound && previousRound.winner && !previousRound.tie) {
        const newTurn = match.table.getPlayerPosition(previousRound.winner.id)
        if (newTurn !== -1) {
          hand.setTurn(newTurn)
        }
      }

      while (i < match.table.players.length) {
        const player = match.table.player(hand.turn)
        hand.setCurrentPlayer(player)
        if (player.disabled) {
          hand.setCurrentPlayer(null)
        }

        if (hand.turn >= match.table.players.length - 1) {
          hand.setTurn(0)
        } else {
          hand.setTurn(hand.turn + 1)
        }

        i++

        yield hand
      }

      const teamIdx = checkHandWinner(hand.rounds, forehandTeamIdx, match.teams)

      if (teamIdx !== null) {
        hand.addPoints(teamIdx, hand.truco.state)
        hand.setState(EHandState.FINISHED)
      }

      // End hand if all players in one team go MAZO
      const someTeamForfeited = match.teams[0].isTeamDisabled() || match.teams[1].isTeamDisabled()
      if (someTeamForfeited) {
        hand.setState(EHandState.FINISHED)
        break
      }
      currentRoundIdx++
    }
    yield hand
  }

  const roundsGenerator = roundsGeneratorSequence()

  const commands: IHandCommands = {
    [ESayCommand.MAZO]: (player) => {
      hand.disablePlayer(player)
    },
    [ESayCommand.TRUCO]: (player) => {
      const { teamIdx } = hand.truco
      if (teamIdx === null || teamIdx !== player.teamIdx) {
        hand.setState(EHandState.WAITING_FOR_TRUCO_ANSWER)
      }
    },
    [ESayCommand.FLOR]: () => {},
    [ESayCommand.CONTRAFLOR]: () => {},
    [EEnvidoCommand.ENVIDO]: () => {},
    [EEnvidoCommand.ENVIDO_ENVIDO]: () => {},
    [EEnvidoCommand.REAL_ENVIDO]: () => {},
    [EEnvidoCommand.FALTA_ENVIDO]: () => {},
  }

  const hand: IHand = {
    idx,
    turn: Number(match.table.forehandIdx),
    state: EHandState.WAITING_PLAY,
    rounds: [],
    truco: {
      state: 1,
      teamIdx: null,
    },
    envido: {
      accept: 1,
      decline: 2,
      teamIdx: null,
    },
    points: [0, 0],
    currentRound: null,
    currentPlayer: null,
    commands,
    play() {
      return PlayInstance(hand, match.teams)
    },
    getNextPlayer() {
      return roundsGenerator.next()
    },
    disablePlayer(player) {
      match.teams[player.teamIdx].disable(player)
    },
    addPoints(team, points) {
      hand.points[team] = hand.points[team] + points
    },
    pushRound(round) {
      hand.rounds.push(round)
      return round
    },
    setTurn(turn) {
      hand.turn = turn
      return match.table.player(hand.turn)
    },
    setCurrentRound(round) {
      hand.currentRound = round
      return hand.currentRound
    },
    setCurrentPlayer(player) {
      hand.currentPlayer = player
      return hand.currentPlayer
    },
    setState(state) {
      hand.state = state
      return hand.state
    },
    finished: () => {
      return hand.state === EHandState.FINISHED
    },
  }

  return hand
}
