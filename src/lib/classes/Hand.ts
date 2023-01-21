import {
  EEnvidoCommand,
  EHandState,
  ESayCommand,
  IDeck,
  IHand,
  IHandCommands,
  IMatch,
  IPlayer,
} from "../types"
import { checkHandWinner } from "../utils"
import { PlayInstance } from "./Play"
import { Round } from "./Round"

export function Hand(match: IMatch, deck: IDeck, idx: number) {
  match.teams.forEach((team) => {
    team.players.forEach((player) => {
      const playerHand = [deck.takeCard(), deck.takeCard(), deck.takeCard()]
      player.setHand(playerHand)
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
        if (hand.disabledPlayerIds.includes(player.id)) {
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

      const teamIdx = checkHandWinner(hand.rounds, forehandTeamIdx)

      if (teamIdx !== null) {
        hand.addPoints(teamIdx, hand.truco.state)
        hand.setState(EHandState.FINISHED)
      }
      currentRoundIdx++
    }
    yield hand
  }

  const roundsGenerator = roundsGeneratorSequence()

  const commands: IHandCommands = {
    [ESayCommand.MAZO]: (player: IPlayer) => {
      hand.disablePlayer(player)
      // hand.addPoints(Number(!player.teamIdx) as 0 | 1, hand.rounds.length === 1 ? 2 : 1)
      // hand.setState(EHandState.FINISHED)
    },
    [ESayCommand.TRUCO]: () => {},
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
    disabledPlayerIds: [],
    currentRound: null,
    currentPlayer: null,
    commands,
    play() {
      return PlayInstance(hand)
    },
    getNextPlayer() {
      return roundsGenerator.next()
    },
    disablePlayer(player) {
      hand.disabledPlayerIds.push(player.id)
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
