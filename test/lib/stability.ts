import { expect } from "chai"
import { Table } from "../../src/lib"
import {
  EEnvidoCommand,
  EFlorCommand,
  EHandState,
  ESayCommand,
  ILobbyOptions,
  IPlayer,
} from "../../src/types"
import {
  DEFAULT_LOBBY_OPTIONS,
  GameLoop,
  getPicaPicaLimits,
  Hand,
  Match,
  Player,
  Team,
} from "../../src/truco"
import logger from "../../src/utils/logger"

describe("Trucoshi Stability", () => {
  it("should scale pica-pica limits with custom match points", () => {
    expect(getPicaPicaLimits(9)).to.deep.equal({ startMalas: 3, endBuenas: 6 })
    expect(getPicaPicaLimits(12)).to.deep.equal({ startMalas: 4, endBuenas: 8 })
    expect(getPicaPicaLimits(15)).to.deep.equal({ startMalas: 5, endBuenas: 10 })
  })

  function createTwoPlayerMatch(options: Partial<ILobbyOptions> = {}) {
    const player1 = Player({
      key: "p1",
      name: "Player 1",
      teamIdx: 0,
      accountId: 1,
      avatarUrl: "",
    })
    const player2 = Player({
      key: "p2",
      name: "Player 2",
      teamIdx: 1,
      accountId: 2,
      avatarUrl: "",
    })

    player1.setSession("p1")
    player2.setSession("p2")
    player1.setIdx(0)
    player2.setIdx(1)
    player1.setHand(["7c", "6c", "5c"])
    player2.setHand(["7b", "6b", "5b"])

    const team1 = Team(0).setPlayers([player1])
    const team2 = Team(1).setPlayers([player2])
    const table = Table("stability-test", [player1, player2])

    return {
      player1,
      player2,
      team1,
      team2,
      table,
      match: Match(
        "stability-test",
        table,
        [team1, team2],
        Object.assign(structuredClone(DEFAULT_LOBBY_OPTIONS), options)
      ),
    }
  }

  it("should not terminate the process when a game loop turn throws", async () => {
    const { match, team1 } = createTwoPlayerMatch()
    let playCalls = 0
    let winnerCallbackCalls = 0

    match.play = async () => {
      playCalls++
      throw new Error("forced game loop failure")
    }

    const previousLoggerLevel = logger.level
    logger.level = "silent"
    try {
      await GameLoop(match)
        .onWinner(async (winner) => {
          winnerCallbackCalls++
          expect(winner).to.equal(team1)
        })
        .begin()
    } finally {
      logger.level = previousLoggerLevel
    }

    expect(playCalls).to.equal(1)
    expect(winnerCallbackCalls).to.equal(1)
    expect(match.winner).to.equal(team1)
  })

  it("should exit envido waiting state when envido has no playable responder", () => {
    const { match, team1 } = createTwoPlayerMatch()
    const hand = Hand(match, 1)

    hand.envido.finished = true
    hand.envido.answer = false
    hand.envido.winner = team1
    hand.setState(EHandState.WAITING_ENVIDO_ANSWER)

    const result = hand.getNextTurn()

    expect(result.done).to.equal(false)
    expect(hand.state).to.not.equal(EHandState.WAITING_ENVIDO_ANSWER)
  })

  it("should exit truco waiting state when truco answer has already resolved", () => {
    const { match } = createTwoPlayerMatch()
    const hand = Hand(match, 1)

    hand.truco.waitingAnswer = false
    hand.truco.answer = false
    hand.setState(EHandState.WAITING_FOR_TRUCO_ANSWER)

    const result = hand.getNextTurn()

    expect(result.done).to.equal(false)
    expect(hand.state).to.equal(EHandState.DISPLAY_PREVIOUS_HAND)
  })

  it("should auto-resolve truco when all responders are unavailable", () => {
    const { player1, player2, team1, team2 } = createTwoPlayerMatch()
    player2.disable()

    const truco = Hand(
      Match(
        "stability-truco",
        Table("stability-truco", [player1, player2]),
        [team1, team2],
        structuredClone(DEFAULT_LOBBY_OPTIONS)
      ),
      1
    ).truco

    truco.sayTruco(player1)
    const { value } = truco.getNextPlayer()
    if (!value) {
      throw new Error("Expected truco generator value")
    }

    expect(value.answer).to.equal(false)
    expect(value.waitingAnswer).to.equal(false)
    expect(value.currentPlayer).to.equal(null)
  })

  it("should auto-resolve envido when all responders are unavailable", () => {
    const { player1, player2, team1, team2 } = createTwoPlayerMatch()
    const table = Table("stability-envido", [player1, player2])
    const hand = Hand(
      Match("stability-envido", table, [team1, team2], {
        ...structuredClone(DEFAULT_LOBBY_OPTIONS),
        flor: false,
      }),
      1
    )

    hand.envido.sayEnvido(EEnvidoCommand.ENVIDO, player1)
    player2.disable()
    const { value } = hand.envido.getNextPlayer()
    if (!value) {
      throw new Error("Expected envido generator value")
    }

    expect(value.finished).to.equal(true)
    expect(value.answer).to.equal(false)
    expect(value.winner).to.equal(team1)
  })

  it("should auto-resolve flor when all responders are unavailable", () => {
    const { player1, player2, team1, team2 } = createTwoPlayerMatch({ flor: true })
    player1.setHand(["7c", "6c", "5c"])
    player2.setHand(["7b", "6b", "5b"])

    const table = Table("stability-flor", [player1, player2])
    const hand = Hand(
      Match("stability-flor", table, [team1, team2], {
        ...structuredClone(DEFAULT_LOBBY_OPTIONS),
        flor: true,
      }),
      1
    )

    hand.flor.sayFlor(player1)
    player2.disable()
    const { value } = hand.flor.getNextPlayer()
    if (!value) {
      throw new Error("Expected flor generator value")
    }

    expect(value.finished).to.equal(true)
    expect(value.answer).to.equal(false)
    expect(value.winner).to.equal(team1)
  })

  function createSixPlayerMatch(options: Partial<ILobbyOptions> = {}) {
    const players = [0, 1, 2, 3, 4, 5].map((idx) => {
      const player = Player({
        key: `p${idx}`,
        name: `Player ${idx}`,
        teamIdx: (idx % 2) as 0 | 1,
        accountId: idx + 1,
        avatarUrl: "",
      })
      player.setSession(`p${idx}`)
      player.setIdx(idx)
      return player
    })

    const team1 = Team(0).setPlayers(players.filter((player) => player.teamIdx === 0))
    const team2 = Team(1).setPlayers(players.filter((player) => player.teamIdx === 1))
    const table = Table("stability-pica", players)

    return {
      players,
      team1,
      team2,
      table,
      match: Match(
        "stability-pica",
        table,
        [team1, team2],
        Object.assign(structuredClone(DEFAULT_LOBBY_OPTIONS), { flor: false }, options, {
          maxPlayers: 6,
        })
      ),
    }
  }

  it("should keep the next envido responder when an earlier responder abandons", () => {
    const { match, players } = createSixPlayerMatch({ flor: true })
    const hand = Hand(match, 1)

    players[3].setHand(["7c", "6c", "5c"])
    players[5].setHand(["7b", "6b", "5b"])

    hand.envido.sayEnvido(EEnvidoCommand.REAL_ENVIDO, players[2])
    hand.setState(EHandState.WAITING_ENVIDO_ANSWER)
    hand.getNextTurn()

    const firstResponder = hand.currentPlayer
    const remainingFlorResponder = players.find(
      (player) => player.teamIdx === 1 && player !== firstResponder && player.hasFlor
    )

    expect(firstResponder?.hasFlor).to.equal(true)
    expect(firstResponder?.commands).to.include(EFlorCommand.FLOR)
    expect(remainingFlorResponder).to.not.equal(undefined)

    if (!firstResponder || !remainingFlorResponder) {
      throw new Error("Expected two flor responders")
    }

    hand.abandonPlayer(firstResponder)
    hand.getNextTurn()

    expect(hand.currentPlayer).to.equal(remainingFlorResponder)
    expect(hand.currentPlayer.commands).to.include(EFlorCommand.FLOR)
  })

  it("should keep the next truco responder when an earlier responder abandons", () => {
    const { match, players } = createSixPlayerMatch({ flor: true })
    const hand = Hand(match, 1)

    players[3].setHand(["7c", "6c", "5c"])
    players[5].setHand(["7b", "6b", "5b"])

    hand.truco.sayTruco(players[0])
    hand.setState(EHandState.WAITING_FOR_TRUCO_ANSWER)
    hand.getNextTurn()

    const firstResponder = hand.currentPlayer
    const remainingFlorResponder = players.find(
      (player) => player.teamIdx === 1 && player !== firstResponder && player.hasFlor
    )

    expect(firstResponder?.hasFlor).to.equal(true)
    expect(firstResponder?.commands).to.include(EFlorCommand.FLOR)
    expect(remainingFlorResponder).to.not.equal(undefined)

    if (!firstResponder || !remainingFlorResponder) {
      throw new Error("Expected two flor responders")
    }

    hand.say(ESayCommand.MAZO, firstResponder)
    hand.abandonPlayer(firstResponder)
    hand.getNextTurn()

    expect(hand.currentPlayer).to.equal(remainingFlorResponder)
    expect(hand.currentPlayer.commands).to.include(EFlorCommand.FLOR)
  })

  it("should keep the next flor responder when an earlier responder abandons", () => {
    const { match, players } = createSixPlayerMatch({ flor: true })
    const hand = Hand(match, 1)

    players[0].setHand(["7e", "6e", "5e"])
    players[1].setHand(["7c", "6c", "5c"])
    players[3].setHand(["7b", "6b", "5b"])
    players[5].setHand(["7o", "6o", "5o"])

    hand.flor.sayFlor(players[0])

    const responders = [...hand.flor.players]
    const firstTurn = hand.flor.getNextPlayer().value
    const firstResponder = firstTurn?.currentPlayer

    expect(responders).to.have.length(3)
    expect(firstResponder).to.equal(responders[0])

    if (!firstResponder) {
      throw new Error("Expected a flor responder")
    }

    firstResponder.abandon()

    const secondTurn = hand.flor.getNextPlayer().value
    expect(secondTurn?.currentPlayer).to.equal(responders[1])
  })

  function recordHandStarts(
    handStarts: Map<number, number[]>,
    players: IPlayer[],
    handIdx: number
  ) {
    if (handStarts.has(handIdx)) {
      return
    }
    const activePlayers = players
      .filter((player) => !player.disabled)
      .map((player) => player.idx)
      .sort((a, b) => a - b)
    handStarts.set(handIdx, activePlayers)
  }

  it("should keep regular hands before pica threshold is reached", async () => {
    const { match, players } = createSixPlayerMatch({ matchPoint: 9 })
    const handStarts = new Map<number, number[]>()

    await GameLoop(match)
      .onTurn(async (play) => {
        recordHandStarts(handStarts, players, play.handIdx)
        if (play.player?.commands.includes(ESayCommand.MAZO)) {
          play.say(ESayCommand.MAZO, play.player)
        }
      })
      .onHandFinished(async () => {
        if (handStarts.size >= 3) {
          match.setWinner(match.teams[0])
        }
      })
      .onWinner(async () => {})
      .begin()

    expect([...handStarts.values()]).to.deep.equal([
      [0, 1, 2, 3, 4, 5],
      [0, 1, 2, 3, 4, 5],
      [0, 1, 2, 3, 4, 5],
    ])
  })

  it("should alternate pica-pica cycles with fixed opposite-seat pairs", async () => {
    const { match, team1, players } = createSixPlayerMatch({ matchPoint: 15 })
    const handStarts = new Map<number, number[]>()

    team1.addPoints(match.options.matchPoint, 5)

    await GameLoop(match)
      .onTurn(async (play) => {
        recordHandStarts(handStarts, players, play.handIdx)
        if (play.player?.commands.includes(ESayCommand.MAZO)) {
          play.say(ESayCommand.MAZO, play.player)
        }
      })
      .onHandFinished(async () => {
        if (handStarts.size >= 7) {
          match.setWinner(match.teams[0])
        }
      })
      .onWinner(async () => {})
      .begin()

    expect([...handStarts.values()]).to.deep.equal([
      [0, 3],
      [1, 4],
      [2, 5],
      [0, 1, 2, 3, 4, 5],
      [0, 3],
      [1, 4],
      [2, 5],
    ])
  })

  it("should finish the current pica-pica round before ending at the buenas limit", async () => {
    const { match, team1, players } = createSixPlayerMatch({ matchPoint: 15 })
    const handStarts = new Map<number, number[]>()

    team1.addPoints(match.options.matchPoint, 5)

    await GameLoop(match)
      .onTurn(async (play) => {
        recordHandStarts(handStarts, players, play.handIdx)
        if (play.player?.commands.includes(ESayCommand.MAZO)) {
          play.say(ESayCommand.MAZO, play.player)
        }
      })
      .onHandFinished(async () => {
        if (handStarts.size === 1) {
          team1.points.buenas = 10
        } else if (handStarts.size === 4) {
          match.setWinner(match.teams[0])
        }
      })
      .onWinner(async () => {})
      .begin()

    expect([...handStarts.values()]).to.deep.equal([
      [0, 3],
      [1, 4],
      [2, 5],
      [0, 1, 2, 3, 4, 5],
    ])
  })

  it("should permanently stop pica-pica after a player abandons", async () => {
    const { match, team1, players } = createSixPlayerMatch({ matchPoint: 15 })
    const handStarts = new Map<number, number[]>()

    team1.addPoints(match.options.matchPoint, 5)

    await GameLoop(match)
      .onTurn(async (play) => {
        recordHandStarts(handStarts, players, play.handIdx)
        if (play.player?.commands.includes(ESayCommand.MAZO)) {
          play.say(ESayCommand.MAZO, play.player)
        }
      })
      .onHandFinished(async () => {
        if (handStarts.size === 1) {
          players[1].abandon()
        } else if (handStarts.size === 3) {
          match.setWinner(match.teams[0])
        }
      })
      .onWinner(async () => {})
      .begin()

    expect([...handStarts.values()]).to.deep.equal([
      [0, 3],
      [0, 2, 3, 4, 5],
      [0, 2, 3, 4, 5],
    ])
  })
})
