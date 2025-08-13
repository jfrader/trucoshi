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
  GAME_ERROR,
  ICard,
  IHandCommands,
  IHandPoints,
  IHandRoundLog,
  IPlayer,
  IPlayedCard,
} from "../types"
import { Envido, IEnvido } from "./Envido"
import { IMatch } from "./Match"
import { IPlayInstance, PlayInstance } from "./Play"
import { IRound, Round } from "./Round"
import { ITruco, Truco } from "./Truco"
import { PlayedCard, dealCards } from "../lib"
import { checkHandWinner, getOpponentTeam } from "../lib/utils"
import { Flor, IFlor } from "./Flor"
import { getMemoLatestBitcoinBlock } from "../accounts/client"

const log = logger.child({ class: "Hand" })

export interface IHand {
  idx: number
  secret: string
  clientSecrets: string[]
  bitcoinHash: string
  bitcoinHeight: number
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
  get roundsLogFlatten(): Array<Array<string>>
  get currentPlayer(): IPlayer | null
  set currentPlayer(player: IPlayer | null)
  currentRound: IRound | null
  playedCards: IPlayedCard[]
  init(): Promise<IHand>
  setBitcoinBlock(hash: string, height: number): void
  setTrucoWinner(teamIdx: 0 | 1): void
  setEnvidoWinner(teamIdx: 0 | 1): void
  setFlorWinner(teamIdx: 0 | 1): void
  say(command: ECommand, player: IPlayer): ECommand | null
  sayEnvidoPoints(player: IPlayer, points: number, log?: boolean): number
  sayFlorPoints(player: IPlayer, points: number, log?: boolean): number
  use(idx: number, card: ICard, burn?: boolean): ICard | null
  finished: () => boolean
  displayingFlorBattle: () => boolean
  displayingPreviousHand: () => boolean
  setTurnCommands(): void
  play(): IPlayInstance
  nextTurn(): void
  endEnvido(): void
  pushRound(round: IRound): IRound
  setTurn(turn: number): IPlayer
  addPoints(team: 0 | 1, points: number): void
  disablePlayer(player: IPlayer): void
  abandonPlayer(player: IPlayer): void
  setCurrentRound(round: IRound | null): IRound | null
  setCurrentPlayer(player: IPlayer | null): IPlayer | null
  setState(state: EHandState): EHandState
  getNextTurn(): IteratorResult<IHand, IHand | void>
  addLog(roundIdx: number, log: IHandRoundLog): void
}

function checkTeamsDisabled(match: IMatch, winnerTeamIdx: 0 | 1 | null) {
  const playerWithFlor =
    match.options.flor &&
    match.table.players.find((p) => !p.disabled && p.hasFlor && !p.hasSaidFlor)

  if (playerWithFlor && !match.teams.some((t) => t.isTeamAbandoned())) {
    winnerTeamIdx = null
    return winnerTeamIdx
  }

  if (match.teams[0].isTeamDisabled()) {
    winnerTeamIdx = 1
  }
  if (match.teams[1].isTeamDisabled()) {
    winnerTeamIdx = 0
  }

  return winnerTeamIdx
}

function* handTurnGeneratorSequence(match: IMatch, hand: IHand) {
  let currentRoundIdx = 0
  let forehandTeamIdx = match.table.getPlayerByPosition(hand.turn).teamIdx

  while (currentRoundIdx < 3 && !hand.finished() && !hand.displayingPreviousHand()) {
    const round = Round()
    hand.setCurrentRound(round)
    hand.pushRound(round)

    let previousRound = hand.rounds[currentRoundIdx - 1]
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

      while (hand.state === EHandState.WAITING_FLOR_ANSWER) {
        const { value } = hand.flor.getNextPlayer()
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

      while (hand.state === EHandState.DISPLAY_FLOR_BATTLE) {
        if (hand.currentPlayer) {
          hand.setCurrentPlayer(null)
        } else {
          hand.endEnvido()
          match.table
            .getPlayersForehandFirst()
            .filter((player) => player.hasSaidFlor)
            .forEach((player) => player.flor && hand.sayFlorPoints(player, player.flor.value))
          continue
        }
        yield hand
      }

      if (hand.truco.answer === false) {
        hand.setCurrentPlayer(null)
        hand.setState(EHandState.DISPLAY_PREVIOUS_HAND)
        break
      }

      if (hand.envido.winner) {
        const simulatedPoints = hand.envido.winner.addPoints(
          match.options.matchPoint,
          hand.envido.getPointsToGive(),
          true
        )
        if (simulatedPoints.winner) {
          hand.setState(EHandState.DISPLAY_PREVIOUS_HAND)
          break
        }
      }

      if (hand.flor.winner) {
        const simulatedPoints = hand.flor.winner.addPoints(
          match.options.matchPoint,
          hand.flor.getPointsToGive(),
          true
        )
        if (simulatedPoints.winner) {
          hand.setState(EHandState.DISPLAY_PREVIOUS_HAND)
          break
        }
      }

      const player = match.table.getPlayerByPosition(hand.turn)
      hand.setCurrentPlayer(player)

      if (checkTeamsDisabled(match, null) !== null) {
        hand.setState(EHandState.DISPLAY_PREVIOUS_HAND)
        break
      }

      if (round.unbeatable && checkHandWinner(hand, forehandTeamIdx) !== null) {
        hand.setState(EHandState.DISPLAY_PREVIOUS_HAND)
        break
      }

      yield hand
    }

    const winnerTeamIdx = checkTeamsDisabled(match, checkHandWinner(hand, forehandTeamIdx))

    if (winnerTeamIdx !== null) {
      hand.addPoints(winnerTeamIdx, hand.truco.state)
      hand.setTrucoWinner(winnerTeamIdx)
      hand.setState(EHandState.DISPLAY_PREVIOUS_HAND)
    }

    if (hand.state === EHandState.DISPLAY_PREVIOUS_HAND) {
      if (hand.envido.winner) {
        hand.setEnvidoWinner(hand.envido.winner.id)
        hand.addPoints(hand.envido.winner.id, hand.envido.getPointsToGive())
      }
      if (hand.flor.winner) {
        hand.setFlorWinner(hand.flor.winner.id)
        hand.addPoints(hand.flor.winner.id, hand.flor.getPointsToGive())
      }
    }

    currentRoundIdx++
  }

  yield hand
  hand.setState(EHandState.FINISHED)
  yield hand
}

export function Hand(match: IMatch, idx: number) {
  const hand: IHand = {
    idx,
    secret: "",
    clientSecrets: [],
    bitcoinHash: "",
    bitcoinHeight: 0,
    started: false,
    trucoWinnerIdx: undefined,
    envidoWinnerIdx: undefined,
    florWinnerIdx: undefined,
    turn: Number(match.table.forehandIdx),
    state: EHandState.WAITING_PLAY,
    rounds: [],
    roundsLog: [[], [], []],
    get roundsLogFlatten() {
      return hand.roundsLog
        .filter((round) => round.length)
        .map((round) => round.flatMap((r) => `Player ${r.player}: ${r.card || r.command}`))
    },
    envido: Envido(match.teams, match.options, match.table),
    flor: Flor(match.teams, match.options, match.table),
    truco: Truco(match.teams),
    playedCards: [],
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
      if (hand.state === EHandState.WAITING_FLOR_ANSWER) {
        player = hand.flor.currentPlayer
      }
      if (hand.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
        player = hand.truco.currentPlayer
      }
      return player
    },
    async init() {
      for (const team of match.teams) {
        for (const player of team.players) {
          if (player.abandoned) {
            continue
          }
          player.enable()
          player.resetCommands()
        }
      }

      await match.deck.random.getLatestBitcoinBlock(getMemoLatestBitcoinBlock)
      hand.setBitcoinBlock(match.deck.random.bitcoinHash, match.deck.random.bitcoinHeight)

      match.deck.shuffle(match.table.getPlayerByPosition(0, true).idx)

      dealCards(match.table, match.deck)

      const { secret, clients: clientSecrets } = match.deck.random.reveal()

      hand.secret = secret
      hand.clientSecrets = clientSecrets

      return hand
    },
    addLog(roundIdx, log) {
      hand.roundsLog[roundIdx].push(log)
    },
    play() {
      return PlayInstance(hand, match.teams, match.table.forehandIdx, match.options)
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
        if (command === EFlorCommand.FLOR && hand.envido.started && !hand.envido.finished) {
          hand.envido.finished = true
          hand.envido.winner = null
          hand.envido.answered = true
          hand.envido.accepted = false
          hand.envido.stake = 0
          hand.envido.declineStake = 0
        }
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
    sayFlorPoints(player, points, log = true) {
      if (log) {
        hand.addLog(hand.rounds.length - 1, { player: player.idx, command: points })
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

        const playedCard = PlayedCard(player, playerCard, burn)
        hand.playedCards.push(playedCard)

        const card = round.use(playedCard, hand.playedCards)

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

      log.trace({ round: hand.roundsLogFlatten }, "Calling round next turn")

      hand.currentRound?.nextTurn()
    },
    setBitcoinBlock(hash, height) {
      hand.bitcoinHash = hash
      hand.bitcoinHeight = height
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
      const updatedHand = roundsGenerator.next()
      hand.setTurnCommands()
      return updatedHand
    },
    disablePlayer(player) {
      match.teams[player.teamIdx].disable(player)
    },
    abandonPlayer(player) {
      if (match.teams[player.teamIdx].abandon(player)) {
        hand.nextTurn()
      }
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
      logger.trace({ previousState: hand.state, newState: state }, "Setting Hand State")
      hand.state = state
      return hand.state
    },
    finished: () => {
      return hand.state === EHandState.FINISHED
    },
    displayingFlorBattle: () => {
      return hand.state === EHandState.DISPLAY_FLOR_BATTLE
    },
    displayingPreviousHand: () => {
      return hand.state === EHandState.DISPLAY_PREVIOUS_HAND
    },
  }

  const roundsGenerator = handTurnGeneratorSequence(match, hand)

  return hand
}

const setTurnCommands = (match: IMatch, hand: IHand) => {
  match.table.players.forEach((player) => player.resetCommands())

  const currentPlayer = hand.currentPlayer
  if (!currentPlayer) return

  handleEnvido(match, hand, currentPlayer)
  handleTrucoAndMazo(match, hand, currentPlayer)

  if (match.options.flor) {
    handleFlor(match, hand, currentPlayer)
  }
}

const handleEnvido = (match: IMatch, hand: IHand, currentPlayer: IPlayer) => {
  const envido = hand.envido
  const opposingTeamIdx = getOpponentTeam(envido.teamIdx)

  if (
    envido.teamIdx !== null &&
    !envido.answered &&
    (!match.options.flor ||
      hand.flor.finished ||
      match.teams[opposingTeamIdx].activePlayers.every((p) => !p.hasFlor || p.hasSaidFlor))
  ) {
    match.teams[opposingTeamIdx].activePlayers.forEach((player) => {
      envido.possibleAnswerCommands.forEach((cmd) => player._commands.add(cmd))
      if (
        !player.hasPassed &&
        currentPlayer.idx === player.idx &&
        match.teams[opposingTeamIdx].activePlayers.length > 1
      ) {
        player._commands.add(ESayCommand.PASO)
      }
    })
  }

  if (
    envido.accepted &&
    !envido.finished &&
    envido.winningPointsAnswer > 0 &&
    currentPlayer.teamIdx !== envido.winner?.id
  ) {
    if (
      match.teams[currentPlayer.teamIdx].activePlayers
        .filter((p) => p.key !== currentPlayer.key)
        .every((p) => p.hasSaidEnvidoPoints)
    ) {
      currentPlayer._commands.add(EEnvidoAnswerCommand.SON_BUENAS)
    } else {
      currentPlayer._commands.add(ESayCommand.PASO)
    }
  }

  if (
    hand.rounds.length <= 1 &&
    !envido.started &&
    (!match.options.flor || !hand.flor.started) &&
    !hand.truco.answer &&
    match.teams[currentPlayer.teamIdx].players.every(
      (p) => !p.hasSaidTruco && (!match.options.flor || !p.hasFlor)
    )
  ) {
    const teamatesCanEnvido = match.teams[currentPlayer.teamIdx].activePlayers.filter(
      (p) => p.idx !== currentPlayer.idx && p.usedHand.length === 0
    )

    if (teamatesCanEnvido.length) {
      for (const cmd in EEnvidoCommand) {
        currentPlayer._commands.add(cmd as ECommand)
        teamatesCanEnvido.forEach((p) => p._commands.add(cmd as ECommand))
      }
    } else if (currentPlayer.usedHand.length === 0) {
      for (const cmd in EEnvidoCommand) {
        currentPlayer._commands.add(cmd as ECommand)
      }
    }
  }
}

const handleFlor = (match: IMatch, hand: IHand, currentPlayer: IPlayer) => {
  const flor = hand.flor
  const teamIdx = flor.teamIdx
  const opposingTeamIdx = getOpponentTeam(teamIdx)

  if (
    hand.truco.answer === null &&
    hand.envido.answer === null &&
    teamIdx !== null &&
    !flor.answered &&
    !flor.winner
  ) {
    if (flor.state < 4) {
      match.teams[teamIdx].activePlayers
        .filter((p) => p.hasFlor && !p.hasSaidFlor)
        .forEach((player) => player._commands.add(EFlorCommand.FLOR))
    }

    match.teams[opposingTeamIdx].activePlayers
      .filter((p) => p.hasFlor)
      .forEach((player) => {
        flor.possibleAnswerCommands.forEach((cmd) => player._commands.add(cmd))
      })
  }

  if (
    hand.rounds.length <= 1 &&
    !hand.truco.answer &&
    !hand.envido.answer &&
    flor.state < 4 &&
    !flor.winner
  ) {
    if (
      !currentPlayer.hasSaidFlor &&
      !currentPlayer.disabled &&
      currentPlayer.hasFlor &&
      currentPlayer.usedHand.length === 0
    ) {
      currentPlayer._commands.add(EFlorCommand.FLOR)
    }
  }
}

const handleTrucoAndMazo = (match: IMatch, hand: IHand, currentPlayer: IPlayer) => {
  const { truco, flor, envido } = hand
  const opposingTeamIdx = getOpponentTeam(truco.teamIdx)

  const envidoInProgress = !envido.finished && envido.started

  if (envidoInProgress) return

  match.activePlayers
    .filter((p) => !match.options.flor || flor.finished || !p.hasFlor || p.hasSaidFlor)
    .forEach((player) => {
      const hasTeammateWithUnsaidFlor =
        match.options.flor &&
        !flor.finished &&
        (flor.started ||
          match.teams[player.teamIdx].activePlayers.some(
            (p) => p.key !== player.key && p.hasFlor && !p.hasSaidFlor
          ))

      if (hasTeammateWithUnsaidFlor) {
        player._commands.add(ESayCommand.MAZO)
        return
      }

      if (truco.waitingAnswer) {
        if (!player.hasPassed && player.teamIdx === opposingTeamIdx) {
          const nextCmd = truco.getNextTrucoCommand()
          if (nextCmd) player._commands.add(nextCmd)
          player._commands.add(EAnswerCommand.QUIERO)
          player._commands.add(EAnswerCommand.NO_QUIERO)

          if (
            match.teams[player.teamIdx].activePlayers.length > 1 &&
            currentPlayer.idx === player.idx
          ) {
            player._commands.add(ESayCommand.PASO)
          }
        }
      } else if (truco.teamIdx !== player.teamIdx) {
        const nextCmd = truco.getNextTrucoCommand()
        if (nextCmd) player._commands.add(nextCmd)
        player._commands.add(ESayCommand.MAZO)
      } else {
        player._commands.add(ESayCommand.MAZO)
      }
    })
}

const trucoCommand = (hand: IHand, player: IPlayer) => {
  hand.truco.sayTruco(player)
  hand.setState(EHandState.WAITING_FOR_TRUCO_ANSWER)
}

const commands: IHandCommands = {
  [ESayCommand.PASO]: (hand, player) => {
    if (player.idx !== hand.currentPlayer?.idx) {
      throw new Error(GAME_ERROR.INVALID_COMMAND)
    }

    if (hand.state === EHandState.WAITING_ENVIDO_POINTS_ANSWER) {
      hand.envido.sayPoints(player, 0)
    }

    player.passed()
  },
  [ESayCommand.MAZO]: (hand, player) => {
    hand.disablePlayer(player)

    if (hand.state === EHandState.WAITING_ENVIDO_ANSWER) {
      if (
        hand.envido.teamIdx !== player.teamIdx &&
        !hand.envido.players.find(
          (p) =>
            p.teamIdx === player.teamIdx &&
            p.key !== player.key &&
            !p.disabled &&
            !p.abandoned &&
            !p.hasPassed
        )
      ) {
        hand.envido.sayAnswer(player, false)
        hand.endEnvido()
      }
    }

    if (hand.state === EHandState.WAITING_FLOR_ANSWER) {
      if (
        hand.envido.teamIdx !== player.teamIdx &&
        !hand.envido.players.find(
          (p) =>
            p.hasFlor &&
            !p.hasSaidFlor &&
            p.teamIdx === player.teamIdx &&
            p.key !== player.key &&
            !p.disabled &&
            !p.abandoned
        )
      ) {
        hand.flor.players = hand.flor.players.filter((p) => p.key !== player.key)
        if (!hand.flor.players.length) {
          if (hand.flor.state >= 4) {
            hand.flor.sayAnswer(player, false)
            hand.endEnvido()
          }
        }

        hand.endEnvido()
      }
    }

    if (hand.state === EHandState.WAITING_ENVIDO_POINTS_ANSWER) {
      hand.sayEnvidoPoints(player, 0, false)
    }

    if (hand.state === EHandState.WAITING_FLOR_ANSWER && hand.flor.state >= 4) {
      if (
        hand.flor.teamIdx !== player.teamIdx &&
        !hand.flor.players.find(
          (p) => p.teamIdx === player.teamIdx && p.key !== player.key && !p.disabled && !p.abandoned
        )
      ) {
        hand.flor.sayAnswer(player, false)
        hand.endEnvido()
      }
    }

    if (hand.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
      if (
        hand.truco.teamIdx !== player.teamIdx &&
        !hand.truco.players.find(
          (p) =>
            p.teamIdx === player.teamIdx &&
            p.key !== player.key &&
            !p.disabled &&
            !p.abandoned &&
            !p.hasPassed
        )
      ) {
        hand.truco.sayAnswer(player, false)
        hand.setState(EHandState.WAITING_PLAY)
      }
    }

    if (player.isTurn) {
      hand.nextTurn()
    }
  },
  [EAnswerCommand.QUIERO]: (hand, player) => {
    if (hand.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
      hand.truco.sayAnswer(player, true)
      hand.setState(EHandState.WAITING_PLAY)
    } else if (hand.state === EHandState.WAITING_ENVIDO_ANSWER) {
      hand.envido.sayAnswer(player, true)
      hand.setState(EHandState.WAITING_ENVIDO_POINTS_ANSWER)
    } else if (hand.state === EHandState.WAITING_FLOR_ANSWER) {
      if (hand.flor.state >= 4) {
        hand.flor.sayAnswer(player, true)
        hand.setState(EHandState.DISPLAY_FLOR_BATTLE)
      }
    }
  },
  [EAnswerCommand.NO_QUIERO]: (hand, player) => {
    if (hand.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
      hand.truco.sayAnswer(player, false)
      hand.setState(EHandState.WAITING_PLAY)
    } else if (hand.state === EHandState.WAITING_ENVIDO_ANSWER) {
      hand.envido.sayAnswer(player, false)
      hand.endEnvido()
    } else if (hand.state === EHandState.WAITING_FLOR_ANSWER) {
      if (hand.flor.state >= 4) {
        hand.flor.sayAnswer(player, false)
        hand.endEnvido()
      }
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
    const currentFlor = hand.flor.sayFlor(player)

    if (currentFlor.finished) {
      if (currentFlor.candidates.length > 1) {
        hand.setState(EHandState.DISPLAY_FLOR_BATTLE)
      } else {
        hand.endEnvido()
      }
    } else {
      hand.setState(EHandState.WAITING_FLOR_ANSWER)
    }
  },
  [EFlorCommand.CONTRAFLOR]: (hand, player) => {
    hand.flor.sayContraflor(player)
    hand.setState(EHandState.WAITING_FLOR_ANSWER)
  },
  [EFlorCommand.CONTRAFLOR_AL_RESTO]: (hand, player) => {
    hand.flor.sayContraflorAlResto(player)
    hand.setState(EHandState.WAITING_FLOR_ANSWER)
  },
  [EFlorCommand.ACHICO]: (hand, player) => {
    hand.flor.sayAchico(player)
    hand.endEnvido()
  },
}
