import { CARDS } from "./constants"
import {
  EHandPlayCommand,
  ICard,
  IDeck,
  IHand,
  IPlayInstance,
  IMatch,
  IPlayedCard,
  IPlayer,
  IPoints,
  IRound,
  ITable,
  ITeam,
} from "./types"
import { checkHandWinner, checkMatchWinner, getCardValue, shuffleArray } from "./utils"

function Deck(): IDeck {
  const deck: IDeck = {
    cards: Object.keys(CARDS) as Array<ICard>,
    usedCards: [],
    takeCard() {
      const card = deck.cards.shift() as ICard
      deck.usedCards.push(card)
      return card
    },
    shuffle() {
      deck.cards = deck.cards.concat(deck.usedCards)
      deck.usedCards = []
      deck.cards = shuffleArray(deck.cards)
      if (deck.cards.length !== 40) {
        throw new Error("This is not good")
      }
      return deck
    },
  }
  return deck
}

function Table(teams: Array<ITeam>, size: number): ITable {
  const table: ITable = {
    players: [],
    cards: [],
    forehandIdx: 0,
    nextTurn() {
      if (table.forehandIdx < size * 2 - 1) {
        table.forehandIdx++
      } else {
        table.forehandIdx = 0
      }
      return table.player()
    },
    getPlayerPosition(id: string) {
      return table.players.findIndex((p) => p.id === id)
    },
    player(idx?: number) {
      if (idx !== undefined) {
        return table.players[idx]
      }
      return table.players[table.forehandIdx]
    },
  }

  if (teams[0].players.length != size || teams[1].players.length != size) {
    throw new Error("Unexpected team size")
  }

  for (let i = 0; i < size; i++) {
    table.players.push(teams[0].players[i])
    table.players.push(teams[1].players[i])
  }

  return table
}

function Round(): IRound {
  const round: IRound = {
    highest: -1,
    winner: null,
    cards: [],
    tie: false,
    play({ card, player }: IPlayedCard) {
      const value = getCardValue(card)
      if (round.highest > -1 && value === round.highest) {
        round.tie = true
      }
      if (value > round.highest) {
        round.tie = false
        round.highest = value
        round.winner = player
      }
      round.cards.push({ card, player })
      return card
    },
  }

  return round
}

export function Match(teams: Array<ITeam> = [], matchPoint: number = 9): IMatch {
  const deck = Deck().shuffle()

  const size = teams[0].players.length

  if (size !== teams[1].players.length) {
    throw new Error("Team size mismatch")
  }

  function* handsGeneratorSequence() {
    while (!match.winner) {
      deck.shuffle()
      const hand = match.setCurrentHand(Hand(match, deck, match.hands.length + 1)) as IHand
      match.pushHand(hand)
      while (!hand.finished) {
        const { value } = hand.getNextPlayer()
        if (value && value.finished) {
          continue
        }
        match.setCurrentHand(value as IHand)
        yield match
      }

      match.addPoints(hand.points)
      match.setCurrentHand(null)

      const hasWinner = checkMatchWinner(teams, matchPoint)

      if (hasWinner !== null) {
        match.setWinner(hasWinner)
        match.setCurrentHand(null)
      }
      match.table.nextTurn()
    }
    yield match
  }

  const handsGenerator = handsGeneratorSequence()

  const match: IMatch = {
    winner: null,
    teams: teams as [ITeam, ITeam],
    hands: [],
    table: Table(teams, size),
    currentHand: null,
    play() {
      match.getNextTurn()
      if (!match.currentHand) {
        return
      }
      return match.currentHand.play()
    },
    addPoints(points: IPoints) {
      match.teams[0].addPoints(points[0])
      match.teams[1].addPoints(points[1])
    },
    pushHand(hand: IHand) {
      match.hands.push(hand)
    },
    setCurrentHand(hand: IHand) {
      match.currentHand = hand
      return match.currentHand
    },
    setWinner(winner: ITeam) {
      match.winner = winner
    },
    getNextTurn() {
      return handsGenerator.next()
    },
  }

  return match
}

function PlayInstance(hand: IHand) {
  const instance: IPlayInstance = {
    handIdx: hand.idx,
    roundIdx: hand.rounds.length,
    player: hand.currentPlayer,
    commands: [],
    rounds: hand.rounds,
    use(idx: number) {
      const player = hand.currentPlayer
      const round = hand.currentRound
      if (!player || !round) {
        return null
      }

      const card = player.useCard(idx)
      if (card) {
        return round.play({ player, card })
      }

      return null
    },
    say(command: EHandPlayCommand) {
      if (!hand.currentPlayer) {
        return null
      }
      return hand
    },
  }

  return instance
}

function Hand(match: IMatch, deck: IDeck, idx: number) {
  const truco = 1

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

    while (currentRoundIdx < 3 && !hand.finished) {
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
        hand.setCurrentPlayer(match.table.player(hand.turn))

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
        hand.addPoints(teamIdx, truco)
        hand.setFinished(true)
      }
      currentRoundIdx++
    }
    yield hand
  }

  const roundsGenerator = roundsGeneratorSequence()

  const hand: IHand = {
    idx,
    turn: Number(match.table.forehandIdx),
    rounds: [],
    finished: false,
    points: {
      0: 0,
      1: 0,
    },
    currentRound: null,
    currentPlayer: null,
    play() {
      return PlayInstance(hand)
    },
    pushRound(round: IRound) {
      hand.rounds.push(round)
      return round
    },
    setTurn(turn: number) {
      hand.turn = turn
      return match.table.player(hand.turn)
    },
    addPoints(team: 0 | 1, points: number) {
      hand.points[team] = hand.points[team] + points
    },
    setCurrentRound(round: IRound | null) {
      hand.currentRound = round
      return hand.currentRound
    },
    setCurrentPlayer(player: IPlayer | null) {
      hand.currentPlayer = player
      return hand.currentPlayer
    },
    setFinished(finshed: boolean) {
      hand.finished = finshed
      return hand.finished
    },
    getNextPlayer() {
      return roundsGenerator.next()
    },
  }

  return hand
}

export function Player(id: string, teamIdx: number) {
  const player: IPlayer = {
    id,
    teamIdx,
    hand: [],
    usedHand: [],
    setHand(hand: Array<ICard>) {
      player.hand = hand
      player.usedHand = []
      return hand
    },
    useCard(idx: number) {
      if (player.hand[idx]) {
        const card = player.hand.splice(idx, 1)[0]
        player.usedHand.push(card)
        return card
      }
      return null
    },
  }

  return player
}

export function Team(color: string, players: Array<IPlayer>) {
  const team = {
    _players: new Map<string, IPlayer>(),
    get players() {
      return Array.from(team._players.values())
    },
    color,
    points: 0,
    addPoints(points: number) {
      team.points += points
      return team.points
    },
  }

  players.forEach((player) => team._players.set(player.id, player))

  return team
}
