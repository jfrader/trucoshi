import logger from "../utils/logger"
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
  IHandCommands,
  IHandPoints,
  IHandRoundLog,
  IPlayer,
} from "../types"
import { Envido, IEnvido } from "./Envido"
import { IMatch } from "./Match"
import { IPlayInstance, PlayInstance } from "./Play"
import { IRound, Round } from "./Round"
import { ITruco, Truco } from "./Truco"
import { PlayedCard, dealCards } from "../lib"
import { checkHandWinner } from "../lib/utils"
import { Flor, IFlor } from "./Flor"

const log = logger.child({ class: "Hand" })

export interface IHand {
  idx: number
  secret: string
  clientSecrets: string[]
  state: EHandState
  turn: number
  started: boolean
  points: IHandPoints
  truco: ITruco
  envido: IEnvido
  flor: IFlor
  rounds: Array<IRound>
  roundsLog: [IHandRoundLog[], IHandRoundLog[], IHandRoundLog[]]
  trucoWinnerIdx?: 0 | 1
  envidoWinnerIdx?: 0 | 1
  florWinnerIdx?: 0 | 1
  _currentPlayer: IPlayer | null
  get currentPlayer(): IPlayer | null
  set currentPlayer(player: IPlayer | null)
  currentRound: IRound | null
  setTrucoWinner(teamIdx: 0 | 1): void
  setEnvidoWinner(teamIdx: 0 | 1): void
  setFlorWinner(teamIdx: 0 | 1): void
  say(command: ECommand, player: IPlayer): ECommand | null
  sayEnvidoPoints(player: IPlayer, points: number, log?: boolean): number
  use(idx: number, card: ICard, burn?: boolean): ICard | null
  finished: () => boolean
  beforeFinished: () => boolean
  setTurnCommands(): void
  play(prevHand: IHand | null): IPlayInstance
  nextTurn(): void
  endEnvido(): void
  pushRound(round: IRound): IRound
  setTurn(turn: number): IPlayer
  addPoints(team: 0 | 1, points: number): void
  disablePlayer(player: IPlayer): void
  setCurrentRound(round: IRound | null): IRound | null
  setCurrentPlayer(player: IPlayer | null): IPlayer | null
  setState(state: EHandState): EHandState
  getNextTurn(): IteratorResult<IHand, IHand | void>
  addLog(roundIdx: number, log: IHandRoundLog): void
}

function* handTurnGeneratorSequence(match: IMatch, hand: IHand) {
  let currentRoundIdx = 0
  let forehandTeamIdx = match.table.getPlayerByPosition(hand.turn).teamIdx as 0 | 1

  while (currentRoundIdx < 3 && !hand.beforeFinished() && !hand.finished()) {
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
        hand.setState(EHandState.BEFORE_FINISHED)
        break
      }

      if (hand.envido.winner) {
        const simulatedPoints = hand.envido.winner.addPoints(
          match.options.matchPoint,
          hand.envido.getPointsToGive(),
          true
        )
        if (simulatedPoints.winner) {
          hand.setState(EHandState.BEFORE_FINISHED)
          break
        }
      }

      const player = match.table.getPlayerByPosition(hand.turn)
      hand.setCurrentPlayer(player)

      if (match.teams.some((team) => team.isTeamDisabled())) {
        hand.setState(EHandState.BEFORE_FINISHED)
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
      hand.setTrucoWinner(winnerTeamIdx)
      hand.setState(EHandState.BEFORE_FINISHED)
    }

    if (hand.state === EHandState.BEFORE_FINISHED && hand.envido.winner) {
      hand.setEnvidoWinner(hand.envido.winner.id)
      hand.addPoints(hand.envido.winner.id, hand.envido.getPointsToGive())
    }

    currentRoundIdx++
  }

  yield hand

  hand.setState(EHandState.FINISHED)

  yield hand
}

export function Hand(match: IMatch, idx: number) {
  match.deck.random.next()
  match.deck.shuffle(match.table.getPlayerByPosition(0, true).idx)

  dealCards(match.table, match.deck)

  for (const team of match.teams) {
    for (const player of team.players) {
      if (player.abandoned) {
        continue
      }
      player.enable()
      player.resetCommands()
    }
  }

  const { secret, clients: clientSecrets } = match.deck.random.reveal()

  const hand: IHand = {
    idx,
    secret,
    clientSecrets,
    started: false,
    trucoWinnerIdx: undefined,
    envidoWinnerIdx: undefined,
    florWinnerIdx: undefined,
    turn: Number(match.table.forehandIdx),
    state: EHandState.WAITING_PLAY,
    rounds: [],
    roundsLog: [[], [], []],
    envido: Envido(match.teams, match.options, match.table),
    flor: Flor(match.teams),
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
    addLog(roundIdx, log) {
      hand.roundsLog[roundIdx].push(log)
    },
    play(prevHand) {
      return PlayInstance(hand, prevHand, match.teams)
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
        hand.addLog(hand.rounds.length - 1, { player: player.idx, command })
        return command
      } catch (e) {
        log.error(e, "Error on executing hand command")
        return null
      }
    },
    sayEnvidoPoints(player, points, log = true) {
      const { winner } = hand.envido.sayPoints(player, points)
      if (log) {
        hand.addLog(hand.rounds.length - 1, { player: player.idx, command: points })
      }
      if (winner) {
        hand.endEnvido()
      }
      return points
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

        hand.addLog(hand.rounds.length - 1, { player: player.idx, card })

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
    setTrucoWinner(idx) {
      hand.trucoWinnerIdx = idx
    },
    setEnvidoWinner(idx) {
      hand.envidoWinnerIdx = idx
    },
    setFlorWinner(idx) {
      hand.florWinnerIdx = idx
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
    beforeFinished: () => {
      return hand.state === EHandState.BEFORE_FINISHED
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

    const currentPlayer = hand.currentPlayer

    if (
      currentPlayer &&
      hand.envido.accepted &&
      !hand.envido.finished &&
      hand.envido.winningPointsAnswer > 0 &&
      currentPlayer.teamIdx !== hand.envido.winner?.id &&
      match.teams[currentPlayer.teamIdx].players
        .filter((p) => p.key !== currentPlayer.key)
        .every((v) => v.hasSaidEnvidoPoints)
    ) {
      currentPlayer._commands.add(EEnvidoAnswerCommand.SON_BUENAS)
    }

    const isWaitingTrucoAnswer = hand.truco.state === 2 && hand.truco.answer === null

    if (currentPlayer && !hand.envido.started && (hand.truco.state < 2 || isWaitingTrucoAnswer)) {
      for (const key in EEnvidoCommand) {
        for (const player of match.teams[currentPlayer.teamIdx].players) {
          if (player.usedHand.length === 0) {
            player._commands.add(key as EEnvidoCommand)
          }
        }
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
      match.table.players
        .filter((p) => !p.disabled)
        .forEach((player) => {
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

    if (player.isTurn) {
      hand.nextTurn()
    }
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
      hand.sayEnvidoPoints(player, 0, false)
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
  [EFlorCommand.FLOR]: (hand, player) => {
    hand.flor.sayFlor(player)
    hand.setState(EHandState.WAITING_FLOR_ANSWER)
  },
  [EFlorCommand.CONTRAFLOR]: () => {},
  [EFlorCommand.CONTRAFLOR_AL_RESTO]: () => {},
  [EFlorCommand.ACHICO]: () => {},
}
