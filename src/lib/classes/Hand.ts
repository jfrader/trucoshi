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
import { Truco } from "./Truco"

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
      const round = Round(0)
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

      while (round.turn < match.table.players.length) {

        while (hand.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
          const { value } = hand.truco.getNextPlayer()
          if (value && value.currentPlayer) {
            console.log({ value: value.currentPlayer })
            hand.setCurrentPlayer(value.currentPlayer)
            yield hand
          }
        }

        const player = match.table.player(hand.turn)
        hand.setCurrentPlayer(player)
        if (player.disabled) {
          hand.setCurrentPlayer(null)
        }

        yield hand
      }

      if (match.teams[0].isTeamDisabled() && match.teams[1].isTeamDisabled()) {
        hand.setState(EHandState.FINISHED)
        break
      }

      let winnerTeamIdx = checkHandWinner(hand.rounds, forehandTeamIdx)

      if (match.teams[0].isTeamDisabled()) {
        winnerTeamIdx = 1
      }
      if (match.teams[1].isTeamDisabled()) {
        winnerTeamIdx = 0
      }

      if (winnerTeamIdx !== null) {
        hand.addPoints(winnerTeamIdx, hand.truco.state)
        hand.setState(EHandState.FINISHED)
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
        hand.truco.sayTruco(player.teamIdx as 0 | 1, match.teams[Number(!player.teamIdx)].players)
      }
    },
    [ESayCommand.QUIERO]: () => {
      if (hand.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
        hand.truco.setAnswer(true)
        hand.setState(EHandState.WAITING_PLAY)
      }
    },
    [ESayCommand.NO_QUIERO]: (player) => {
      if (hand.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
        hand.truco.setAnswer(false)
        hand.setState(EHandState.WAITING_PLAY)
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
    truco: Truco(),
    envido: {
      accept: 1,
      decline: 2,
      teamIdx: null,
    },
    points: [0, 0],
    currentRound: null,
    _currentPlayer: null,
    set currentPlayer(player) {
      hand._currentPlayer = player
    },
    get currentPlayer() {
      if (hand.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
        return hand.truco.currentPlayer
      }
      return hand._currentPlayer
    },
    commands,
    play() {
      return PlayInstance(hand, match.teams)
    },
    use(idx: number) {
      const player = hand.currentPlayer
      const round = hand.currentRound
      if (!player || !round) {
        return null
      }

      const card = player.useCard(idx)
      if (card) {
        hand.nextTurn()
        return round.use({ player, card })
      }

      return null
    },
    nextTurn() {
      if (hand.turn >= match.table.players.length - 1) {
        hand.setTurn(0)
      } else {
        hand.setTurn(hand.turn + 1)
      }

      hand.currentRound?.nextTurn()
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
      hand._currentPlayer = player
      return hand._currentPlayer
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
