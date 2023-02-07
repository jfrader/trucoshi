import { EEnvidoCommand, EHandState, EnvidoState, ESayCommand, IHandCommands } from "../../types"
import { checkHandWinner } from "../utils"
import { ICard, IDeck, PlayedCard } from "./Deck"
import { IMatch } from "./Match"
import { IPlayInstance, PlayInstance } from "./Play"
import { IPlayer } from "./Player"
import { IRound, Round } from "./Round"
import { ITruco, Truco } from "./Truco"

export interface IHandPoints {
  0: number
  1: number
}

export interface IHand {
  idx: number
  state: EHandState
  turn: number
  started: boolean
  points: IHandPoints
  truco: ITruco
  envido: EnvidoState
  rounds: Array<IRound>
  _currentPlayer: IPlayer | null
  get currentPlayer(): IPlayer | null
  set currentPlayer(player: IPlayer | null)
  currentRound: IRound | null
  commands: IHandCommands
  finished: () => boolean
  play(prevHand: IHand | null): IPlayInstance | null
  nextTurn(): void
  use(idx: number, card: ICard): ICard | null
  pushRound(round: IRound): IRound
  setTurn(turn: number): IPlayer
  addPoints(team: 0 | 1, points: number): void
  disablePlayer(player: IPlayer): void
  setCurrentRound(round: IRound | null): IRound | null
  setCurrentPlayer(player: IPlayer | null): IPlayer | null
  setState(state: EHandState): EHandState
  getNextPlayer(): IteratorResult<IHand, IHand | void>
}

export function Hand(match: IMatch, deck: IDeck, idx: number) {
  for (const team of match.teams) {
    for (const player of team.players) {
      player.enable()
      player.setHand(deck.takeThree())
    }
  }

  function* roundsGeneratorSequence() {
    let currentRoundIdx = 0
    let forehandTeamIdx = match.table.player(hand.turn).teamIdx as 0 | 1

    while (currentRoundIdx < 3 && !hand.finished()) {
      const round = Round()
      hand.setCurrentRound(round)
      hand.pushRound(round)

      let previousRound = hand.rounds[currentRoundIdx - 1]

      // Put previous round winner as forehand
      if (previousRound && previousRound.winner) {
        if (!previousRound.tie) {
          const newTurn = match.table.getPlayerPosition(previousRound.winner.id)
          if (newTurn !== -1) {
            hand.setTurn(newTurn)
          }
        } else {
          hand.setTurn(match.table.forehandIdx)
        }
      }

      while (round.turn < match.table.players.length) {
        while (hand.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
          const { value } = hand.truco.getNextPlayer()
          if (value && value.currentPlayer) {
            hand.setCurrentPlayer(value.currentPlayer)
            yield hand
          }
        }

        if (hand.truco.answer === false) {
          hand.setState(EHandState.FINISHED)
          break
        }

        const player = match.table.player(hand.turn)
        hand.setCurrentPlayer(player)

        if (player.disabled) {
          hand.setCurrentPlayer(null)
        }

        if (match.teams.some((team) => team.isTeamDisabled())) {
          hand.setState(EHandState.FINISHED)
          break
        }

        yield hand
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
      hand.setState(EHandState.WAITING_PLAY)
      hand.truco.reset()
      hand.nextTurn()
    },
    [ESayCommand.TRUCO]: (player) => {
      hand.truco.sayTruco(player, () => {
        hand.setState(EHandState.WAITING_FOR_TRUCO_ANSWER)
      })
    },
    [ESayCommand.QUIERO]: (player) => {
      if (hand.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
        hand.truco.sayAnswer(player, true, () => {
          hand.setState(EHandState.WAITING_PLAY)
        })
      }
    },
    [ESayCommand.NO_QUIERO]: (player) => {
      if (hand.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
        hand.truco.sayAnswer(player, false, () => {
          hand.setState(EHandState.WAITING_PLAY)
        })
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
    started: false,
    turn: Number(match.table.forehandIdx),
    state: EHandState.WAITING_PLAY,
    rounds: [],
    truco: Truco(match.teams),
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
    play(prevHand) {
      return PlayInstance(hand, prevHand, match.teams)
    },
    use(idx: number, card: ICard) {
      hand.started = true
      const player = hand.currentPlayer
      const round = hand.currentRound
      if (!player || !round) {
        return null
      }

      const playerCard = player.useCard(idx, card)
      if (playerCard) {
        const card = round.use(PlayedCard(player, playerCard))
        hand.nextTurn()
        return card
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
