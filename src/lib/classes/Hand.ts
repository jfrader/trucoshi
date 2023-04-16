import {
  EAnswerCommand,
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
} from "../../types"
import { checkHandWinner } from "../utils"
import { PlayedCard } from "./Deck"
import { Envido, IEnvido } from "./Envido"
import { IMatch } from "./Match"
import { IPlayInstance, PlayInstance } from "./Play"
import { IPlayer } from "./Player"
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
  say: IHandCommands
  finished: () => boolean
  setTurnCommands(): void
  play(prevHand: IHand | null): IPlayInstance | null
  nextTurn(): void
  endEnvido(): void
  sayEnvidoPoints(player: IPlayer, points: number): IEnvido
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
      player.resetCommands()
    }
  }

  function* roundsGeneratorSequence() {
    let currentRoundIdx = 0
    let forehandTeamIdx = match.table.getPlayer(hand.turn).teamIdx as 0 | 1

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

        const player = match.table.getPlayer(hand.turn)
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

        if (hand.envido.winner && hand.envido.winningPlayer) {
          hand.addPoints(
            hand.envido.winningPlayer.teamIdx as 0 | 1,
            hand.envido.answer === false ? hand.envido.declineStake : hand.envido.stake
          )
        }
      }

      currentRoundIdx++
    }
    yield hand
  }

  const roundsGenerator = roundsGeneratorSequence()

  const trucoCommand = (player: IPlayer) => {
    hand.truco.sayTruco(player)
    hand.setState(EHandState.WAITING_FOR_TRUCO_ANSWER)
  }

  const hand: IHand = {
    idx,
    started: false,
    turn: Number(match.table.forehandIdx),
    state: EHandState.WAITING_PLAY,
    rounds: [],
    envido: Envido(match.teams, match.matchPoint, match.table),
    truco: Truco(match.teams),
    setTurnCommands() {
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
        if (hand.envido.accepted && !hand.envido.finished && hand.envido.winningPointsAnswer) {
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

      if (player && player.disabled) {
        return null
      }
      return player
    },
    say: {
      [ESayCommand.MAZO]: (player) => {
        hand.disablePlayer(player)
        hand.nextTurn()
      },
      [EAnswerCommand.QUIERO]: (player) => {
        if (hand.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
          hand.truco.sayAnswer(player, true)
          hand.setState(EHandState.WAITING_PLAY)
        }
        if (hand.state === EHandState.WAITING_ENVIDO_ANSWER) {
          hand.envido.sayAnswer(player, true)
          hand.setState(EHandState.WAITING_ENVIDO_POINTS_ANSWER)
        }
      },
      [EAnswerCommand.NO_QUIERO]: (player) => {
        if (hand.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
          hand.truco.sayAnswer(player, false)
          hand.setState(EHandState.WAITING_PLAY)
        }
        if (hand.state === EHandState.WAITING_ENVIDO_ANSWER) {
          hand.envido.sayAnswer(player, false)
          hand.endEnvido()
        }
      },
      [EEnvidoAnswerCommand.SON_BUENAS]: (player) => {
        if (hand.state === EHandState.WAITING_ENVIDO_POINTS_ANSWER) {
          hand.envido.sayPoints(player, 0)
          hand.endEnvido()
        }
      },
      [ETrucoCommand.TRUCO]: trucoCommand,
      [ETrucoCommand.RE_TRUCO]: trucoCommand,
      [ETrucoCommand.VALE_CUATRO]: trucoCommand,
      [EEnvidoCommand.ENVIDO]: (player: IPlayer) => {
        hand.envido.sayEnvido(EEnvidoCommand.ENVIDO, player)
        hand.setState(EHandState.WAITING_ENVIDO_ANSWER)
      },
      [EEnvidoCommand.REAL_ENVIDO]: (player: IPlayer) => {
        hand.envido.sayEnvido(EEnvidoCommand.REAL_ENVIDO, player)
        hand.setState(EHandState.WAITING_ENVIDO_ANSWER)
      },
      [EEnvidoCommand.FALTA_ENVIDO]: (player: IPlayer) => {
        hand.envido.sayEnvido(EEnvidoCommand.FALTA_ENVIDO, player)
        hand.setState(EHandState.WAITING_ENVIDO_ANSWER)
      },
      [EFlorCommand.FLOR]: () => {},
      [EFlorCommand.CONTRAFLOR]: () => {},
    },
    play(prevHand) {
      return PlayInstance(hand, prevHand, match.teams)
    },
    sayEnvidoPoints(player, points) {
      const { winner } = hand.envido.sayPoints(player, points)
      if (winner) {
        hand.endEnvido()
      }
      return hand.envido
    },
    endEnvido() {
      if (hand.truco.waitingAnswer) {
        hand.setState(EHandState.WAITING_FOR_TRUCO_ANSWER)
      } else {
        hand.setState(EHandState.WAITING_PLAY)
      }
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
      return match.table.getPlayer(hand.turn)
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
