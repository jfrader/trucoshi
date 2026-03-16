import { expect } from "chai"
import { Table } from "../../src/lib"
import { EEnvidoCommand, EHandState, ESayCommand, ILobbyOptions, IPlayer } from "../../src/types"
import { DEFAULT_LOBBY_OPTIONS, GameLoop, Hand, Match, Player, Team } from "../../src/truco"
import logger from "../../src/utils/logger"

describe("Trucoshi Stability", () => {
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
        Object.assign(structuredClone(DEFAULT_LOBBY_OPTIONS), options, { maxPlayers: 6, flor: false })
      ),
    }
  }

  function recordHandStarts(handStarts: Map<number, number[]>, players: IPlayer[], handIdx: number) {
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
    const { match, team1, players } = createSixPlayerMatch({ matchPoint: 3 })
    const handStarts = new Map<number, number[]>()

    team1.addPoints(match.options.matchPoint, 2)

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
})
