import logger from "../../utils/logger"
import {
  EAnswerCommand,
  ECommand,
  EEnvidoAnswerCommand,
  EEnvidoCommand,
  EFlorCommand,
  EHandState,
  ESayCommand,
  ETrucoCommand,
  ICard,
  IDeck,
  IHandCommands,
  IHandPoints,
  IPlayer,
} from "../../types"
import { checkHandWinner } from "../utils"
import { PlayedCard } from "./Deck"
import { Envido, IEnvido } from "./Envido"
import { IMatch } from "./Match"
import { IPlayInstance, PlayInstance } from "./Play"
import { IRound, Round } from "./Round"
import { ITruco, Truco } from "./Truco"

export interface IHand {
  idx: number
  state: EHandState
  turn: number
  started: boolean
  points: IHandPoints
  truco: ITruco
  envido: IEnvido
  rounds: Array<IRound>
  _currentPlayer: IPlayer | null
  get currentPlayer(): IPlayer | null
  set currentPlayer(player: IPlayer | null)
  currentRound: IRound | null
  say(command: ECommand, player: IPlayer): ECommand | null
  finished: () => boolean
  setTurnCommands(): void
  play(prevHand: IHand | null): IPlayInstance | null
  nextTurn(): void
  endEnvido(): void
  sayEnvidoPoints(player: IPlayer, points: number): number
  use(idx: number, card: ICard, burn?: boolean): ICard | null
  pushRound(round: IRound): IRound
  setTurn(turn: number): IPlayer
  addPoints(team: 0 | 1, points: number): void
  disablePlayer(player: IPlayer): void
  setCurrentRound(round: IRound | null): IRound | null
  setCurrentPlayer(player: IPlayer | null): IPlayer | null
  setState(state: EHandState): EHandState
  getNextTurn(): IteratorResult<IHand, IHand | void>
}

function* handTurnGeneratorSequence(match: IMatch, hand: IHand) {
  let currentRoundIdx = 0
  let forehandTeamIdx = match.table.getPlayerByPosition(hand.turn).teamIdx as 0 | 1

  while (currentRoundIdx < 3 && !hand.finished()) {
    const round = Round()
    hand.setCurrentRound(round)
    hand.pushRound(round)

    let previousRound = hand.rounds[currentRoundIdx - 1]

    // Put previous round winner as forehand
    if (previousRound && previousRound.winner) {
      if (previousRound.tie) {
        hand.setTurn(match.table.forehandIdx)
      } else {
        const newTurn = match.table.getPlayerPosition(previousRound.winner.key)
        if (newTurn !== -1) {
          hand.setTurn(newTurn)
        }
      }
    }

    while (round.turn < match.table.players.length) {
      while (
        hand.state === EHandState.WAITING_ENVIDO_ANSWER ||
        hand.state === EHandState.WAITING_ENVIDO_POINTS_ANSWER
      ) {
        const { value } = hand.envido.getNextPlayer()
        if (value && value.currentPlayer) {
          hand.setCurrentPlayer(value.currentPlayer)
          yield hand
        }
      }

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

      if (hand.envido.winner) {
        const simulatedPoints = hand.envido.winner.addPoints(
          match.options.matchPoint,
          hand.envido.getPointsToGive(),
          true
        )
        if (simulatedPoints.winner) {
          hand.setState(EHandState.FINISHED)
          break
        }
      }

      const player = match.table.getPlayerByPosition(hand.turn)
      hand.setCurrentPlayer(player)

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

    if (hand.state === EHandState.FINISHED && hand.envido.winner) {
      hand.addPoints(hand.envido.winner.id, hand.envido.getPointsToGive())
    }

    currentRoundIdx++
  }
  yield hand
}

export function Hand(match: IMatch, idx: number) {
  for (const team of match.teams) {
    for (const player of team.players) {
      if (player.abandoned) {
        continue
      }
      player.enable()
      player.setHand(match.deck.takeThree())
      player.resetCommands()
    }
  }
  const hand: IHand = {
    idx,
    started: false,
    turn: Number(match.table.forehandIdx),
    state: EHandState.WAITING_PLAY,
    rounds: [],
    envido: Envido(match.teams, match.options, match.table),
    truco: Truco(match.teams),
    setTurnCommands() {
      return setTurnCommands(match, hand)
    },
    points: [0, 0],
    currentRound: null,
    _currentPlayer: null,
    set currentPlayer(player) {
      hand._currentPlayer = player
    },
    get currentPlayer() {
      let player = hand._currentPlayer
      if (
        hand.state === EHandState.WAITING_ENVIDO_ANSWER ||
        hand.state === EHandState.WAITING_ENVIDO_POINTS_ANSWER
      ) {
        player = hand.envido.currentPlayer
      }
      if (hand.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
        player = hand.truco.currentPlayer
      }

      return player
    },
    play(prevHand) {
      return PlayInstance(hand, prevHand, match.teams)
    },
    sayEnvidoPoints(player, points) {
      const { winner } = hand.envido.sayPoints(player, points)
      if (winner) {
        hand.endEnvido()
      }
      return points
    },
    endEnvido() {
      if (hand.truco.waitingAnswer) {
        hand.setState(EHandState.WAITING_FOR_TRUCO_ANSWER)
      } else {
        hand.setState(EHandState.WAITING_PLAY)
      }
    },
    say(command, player) {
      try {
        commands[command](hand, player)
        hand.started = true
        return command
      } catch (e) {
        logger.error(e)
        return null
      }
    },
    use(idx, card, burn) {
      const player = hand.currentPlayer
      const round = hand.currentRound
      if (!player || !round) {
        return null
      }

      if (hand.state !== EHandState.WAITING_PLAY) {
        return null
      }

      const playerCard = player.useCard(idx, card)
      if (playerCard) {
        hand.started = true
        const card = round.use(PlayedCard(player, playerCard, burn))
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
    getNextTurn() {
      const player = roundsGenerator.next()
      hand.setTurnCommands()
      return player
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
      return match.table.getPlayerByPosition(hand.turn)
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

  const roundsGenerator = handTurnGeneratorSequence(match, hand)

  return hand
}

const setTurnCommands = (match: IMatch, hand: IHand) => {
  match.table.players.forEach((player) => {
    player.resetCommands()
  })

  if (hand.rounds.length === 1) {
    if (hand.envido.teamIdx !== null && !hand.envido.answered) {
      match.teams[Number(!hand.envido.teamIdx)].players.forEach((player) => {
        hand.envido.possibleAnswerCommands.forEach((command) => {
          player._commands.add(command)
        })
      })
    }
    if (
      hand.envido.accepted &&
      !hand.envido.finished &&
      hand.envido.winningPointsAnswer !== -1 &&
      hand.envido.winningPointsAnswer > 0
    ) {
      hand.currentPlayer?._commands.add(EEnvidoAnswerCommand.SON_BUENAS)
    }
    if (
      hand.currentPlayer &&
      !hand.envido.started &&
      (hand.truco.state < 2 || (hand.truco.state === 2 && hand.truco.answer === null))
    ) {
      for (const key in EEnvidoCommand) {
        hand.currentPlayer._commands.add(key as EEnvidoCommand)
      }
    }
  }
  if (hand.envido.finished || !hand.envido.started) {
    if (hand.truco.waitingAnswer) {
      match.teams[Number(!hand.truco.teamIdx)].players.forEach((player) => {
        const nextCommand = hand.truco.getNextTrucoCommand()
        if (nextCommand) {
          player._commands.add(nextCommand)
        }
        player._commands.add(EAnswerCommand.QUIERO)
        player._commands.add(EAnswerCommand.NO_QUIERO)
      })
    } else {
      match.table.players.forEach((player) => {
        if (hand.truco.teamIdx !== player.teamIdx) {
          const nextCommand = hand.truco.getNextTrucoCommand()
          if (nextCommand) {
            player._commands.add(nextCommand)
          }
        }
        player._commands.add(ESayCommand.MAZO)
      })
    }
  }
}

const trucoCommand = (hand: IHand, player: IPlayer) => {
  hand.truco.sayTruco(player)
  hand.setState(EHandState.WAITING_FOR_TRUCO_ANSWER)
}

const commands: IHandCommands = {
  [ESayCommand.MAZO]: (hand, player) => {
    hand.disablePlayer(player)
    hand.nextTurn()
  },
  [EAnswerCommand.QUIERO]: (hand, player) => {
    if (hand.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
      hand.truco.sayAnswer(player, true)
      hand.setState(EHandState.WAITING_PLAY)
    }
    if (hand.state === EHandState.WAITING_ENVIDO_ANSWER) {
      hand.envido.sayAnswer(player, true)
      hand.setState(EHandState.WAITING_ENVIDO_POINTS_ANSWER)
    }
  },
  [EAnswerCommand.NO_QUIERO]: (hand, player) => {
    if (hand.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
      hand.truco.sayAnswer(player, false)
      hand.setState(EHandState.WAITING_PLAY)
    }
    if (hand.state === EHandState.WAITING_ENVIDO_ANSWER) {
      hand.envido.sayAnswer(player, false)
      hand.endEnvido()
    }
  },
  [EEnvidoAnswerCommand.SON_BUENAS]: (hand, player) => {
    if (hand.state === EHandState.WAITING_ENVIDO_POINTS_ANSWER) {
      hand.envido.sayPoints(player, 0)
      hand.endEnvido()
    }
  },
  [ETrucoCommand.TRUCO]: trucoCommand,
  [ETrucoCommand.RE_TRUCO]: trucoCommand,
  [ETrucoCommand.VALE_CUATRO]: trucoCommand,
  [EEnvidoCommand.ENVIDO]: (hand, player) => {
    hand.envido.sayEnvido(EEnvidoCommand.ENVIDO, player)
    hand.setState(EHandState.WAITING_ENVIDO_ANSWER)
  },
  [EEnvidoCommand.REAL_ENVIDO]: (hand, player) => {
    hand.envido.sayEnvido(EEnvidoCommand.REAL_ENVIDO, player)
    hand.setState(EHandState.WAITING_ENVIDO_ANSWER)
  },
  [EEnvidoCommand.FALTA_ENVIDO]: (hand, player) => {
    hand.envido.sayEnvido(EEnvidoCommand.FALTA_ENVIDO, player)
    hand.setState(EHandState.WAITING_ENVIDO_ANSWER)
  },
  [EFlorCommand.FLOR]: () => {},
  [EFlorCommand.CONTRAFLOR]: () => {},
}
