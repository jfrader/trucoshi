import { expect } from "chai"

import {
  EEnvidoCommand,
  EAnswerCommand,
  ITeam,
  ILobbyOptions,
  IPlayer,
  GAME_ERROR,
} from "../../src/types"
import { ITable, Table } from "../../src/lib"
import { DEFAULT_LOBBY_OPTIONS, Player, Team } from "../../src/truco"
import { Envido } from "../../src/truco/Envido"

describe("Trucoshi Envido", () => {
  let player1: IPlayer, player2: IPlayer, player3: IPlayer, player4: IPlayer
  let team1: ITeam, team2: ITeam
  let options: ILobbyOptions
  let table: ITable

  beforeEach(() => {
    // Create players (2 per team)
    player1 = Player({ key: "p1", name: "Player 1", teamIdx: 0, accountId: 1, avatarUrl: "" })
    player2 = Player({ key: "p2", name: "Player 2", teamIdx: 0, accountId: 2, avatarUrl: "" })
    player3 = Player({ key: "p3", name: "Player 3", teamIdx: 1, accountId: 3, avatarUrl: "" })
    player4 = Player({ key: "p4", name: "Player 4", teamIdx: 1, accountId: 4, avatarUrl: "" })

    player1.setSession("p1")
    player2.setSession("p2")
    player3.setSession("p3")
    player4.setSession("p4")

    // Set hands for envido point calculations (mixed suits to avoid flor by default)
    player1.setHand(["7c", "6b", "5c"]) // Envido: 32 (7c+5c)
    player2.setHand(["5o", "1o", "6e"]) // Envido: 25 (5o+1o)
    player3.setHand(["4e", "3e", "2b"]) // Envido: 27 (4e+3e)
    player4.setHand(["7b", "1b", "5c"]) // Envido: 28 (7b+1b)

    // Create teams
    team1 = Team(0, "Team 1").setPlayers([player1, player2])
    team2 = Team(1, "Team 2").setPlayers([player3, player4])

    // Create options with flor disabled by default
    options = {
      ...DEFAULT_LOBBY_OPTIONS,
      matchPoint: 9,
      faltaEnvido: 1,
      flor: false,
    }

    // Create table
    table = Table("test-session", [player1, player3, player2, player4]) // Alternating order
    table.forehandIdx = 0 // Player 1 is forehand
  })

  it("should award 1 point when ENVIDO is declined", (done) => {
    const envido = Envido([team1, team2], options, table)
    envido.sayEnvido(EEnvidoCommand.ENVIDO, player1)
    expect(envido.stake).to.equal(2)
    expect(envido.declineStake).to.equal(1)
    envido.sayAnswer(player3, false)
    expect(envido.answered).to.be.true
    expect(envido.finished).to.be.true
    expect(envido.winner).to.equal(team1)
    expect(envido.getPointsToGive()).to.equal(1)
    done()
  })

  it("should award 2 points when second ENVIDO is declined", (done) => {
    const envido = Envido([team1, team2], options, table)
    envido.sayEnvido(EEnvidoCommand.ENVIDO, player1)
    expect(envido.stake).to.equal(2)
    expect(envido.declineStake).to.equal(1)
    envido.sayEnvido(EEnvidoCommand.ENVIDO, player3)
    expect(envido.stake).to.equal(4)
    expect(envido.declineStake).to.equal(2)
    envido.sayAnswer(player1, false)
    expect(envido.answered).to.be.true
    expect(envido.finished).to.be.true
    expect(envido.winner).to.equal(team2)
    expect(envido.getPointsToGive()).to.equal(2)
    done()
  })

  it("should award 4 points when REAL_ENVIDO is declined after two ENVIDOs", (done) => {
    const envido = Envido([team1, team2], options, table)
    envido.sayEnvido(EEnvidoCommand.ENVIDO, player1)
    expect(envido.stake).to.equal(2)
    expect(envido.declineStake).to.equal(1)
    envido.sayEnvido(EEnvidoCommand.ENVIDO, player3)
    expect(envido.stake).to.equal(4)
    expect(envido.declineStake).to.equal(2)
    envido.sayEnvido(EEnvidoCommand.REAL_ENVIDO, player1)
    expect(envido.stake).to.equal(7)
    expect(envido.declineStake).to.equal(4)
    envido.sayAnswer(player3, false)
    expect(envido.answered).to.be.true
    expect(envido.finished).to.be.true
    expect(envido.winner).to.equal(team1)
    expect(envido.getPointsToGive()).to.equal(4)
    done()
  })

  it("should award 2 points when REAL_ENVIDO is declined after ENVIDO", (done) => {
    const envido = Envido([team1, team2], options, table)
    envido.sayEnvido(EEnvidoCommand.ENVIDO, player1)
    expect(envido.stake).to.equal(2)
    expect(envido.declineStake).to.equal(1)
    envido.sayEnvido(EEnvidoCommand.REAL_ENVIDO, player3)
    expect(envido.stake).to.equal(5)
    expect(envido.declineStake).to.equal(2)
    envido.sayAnswer(player1, false)
    expect(envido.answered).to.be.true
    expect(envido.finished).to.be.true
    expect(envido.winner).to.equal(team2)
    expect(envido.getPointsToGive()).to.equal(2)
    done()
  })

  it("should award 5 points when FALTA_ENVIDO is declined after ENVIDO and REAL_ENVIDO", (done) => {
    const envido = Envido([team1, team2], options, table)
    envido.sayEnvido(EEnvidoCommand.ENVIDO, player1)
    expect(envido.stake).to.equal(2)
    expect(envido.declineStake).to.equal(1)
    envido.sayEnvido(EEnvidoCommand.REAL_ENVIDO, player3)
    expect(envido.stake).to.equal(5)
    expect(envido.declineStake).to.equal(2)
    expect(player3.disabled).to.be.false
    expect(player3.abandoned).to.be.false
    expect(team2.activePlayers.map((p) => p.key)).to.include.members(["p3", "p4"])
    envido.sayEnvido(EEnvidoCommand.FALTA_ENVIDO, player1)
    expect(envido.declineStake).to.equal(5)
    expect(envido.teamIdx).to.equal(0)
    expect(envido.players.map((p) => p.key)).to.include.members(["p3", "p4"])
    envido.sayAnswer(player3, false)
    expect(envido.answered).to.be.true
    expect(envido.finished).to.be.true
    expect(envido.winner).to.equal(team1)
    expect(envido.getPointsToGive()).to.equal(5)
    done()
  })

  it("should handle ENVIDO acceptance with point declarations awarding 2 points", (done) => {
    const envido = Envido([team1, team2], options, table)
    envido.sayEnvido(EEnvidoCommand.ENVIDO, player1)
    expect(envido.stake).to.equal(2)
    expect(envido.declineStake).to.equal(1)
    envido.sayAnswer(player3, true)
    expect(envido.accepted).to.be.true
    expect(envido.players.map((p) => p.key)).to.include.members(["p1", "p3", "p2", "p4"])
    envido.sayPoints(player1, 32)
    expect(envido.winningPlayer).to.equal(player1)
    expect(envido.winningPointsAnswer).to.equal(32)
    expect(player1.hasSaidEnvidoPoints).to.be.true
    envido.sayPoints(player3, 27)
    expect(envido.winningPlayer).to.equal(player1)
    expect(envido.players.map((p) => p.key)).to.include.members(["p4"])
    envido.sayPoints(player2, 25)
    expect(envido.winningPlayer).to.equal(player1)
    envido.sayPoints(player4, 28)
    expect(envido.winningPlayer).to.equal(player1)
    expect(envido.winningPointsAnswer).to.equal(32)
    expect(envido.players).to.have.length(0)
    expect(envido.finished).to.be.true
    expect(envido.winner).to.equal(team1)
    expect(envido.getPointsToGive()).to.equal(2)
    done()
  })

  it("should handle tie in points with forehand advantage", (done) => {
    const envido = Envido([team1, team2], options, table)
    envido.sayEnvido(EEnvidoCommand.ENVIDO, player1)
    envido.sayAnswer(player3, true)
    envido.sayPoints(player1, 27)
    expect(envido.winningPlayer).to.equal(player1)
    expect(envido.winningPointsAnswer).to.equal(27)
    envido.sayPoints(player3, 27)
    expect(envido.winningPlayer).to.equal(player1)
    expect(envido.players.map((p) => p.key)).to.include.members(["p4"])
    expect(envido.winner).to.be.null
    done()
  })

  it("should handle ENVIDO -> ENVIDO -> QUIERO with point declarations awarding 4 points", (done) => {
    const envido = Envido([team1, team2], options, table)
    envido.sayEnvido(EEnvidoCommand.ENVIDO, player1)
    expect(envido.stake).to.equal(2)
    expect(envido.declineStake).to.equal(1)
    envido.sayEnvido(EEnvidoCommand.ENVIDO, player3)
    expect(envido.stake).to.equal(4)
    expect(envido.declineStake).to.equal(2)
    envido.sayAnswer(player1, true)
    expect(envido.accepted).to.be.true
    expect(envido.players.map((p) => p.key)).to.include.members(["p1", "p3", "p2", "p4"])
    envido.sayPoints(player1, 32)
    envido.sayPoints(player3, 27)
    envido.sayPoints(player2, 25)
    envido.sayPoints(player4, 28)
    expect(envido.winningPlayer).to.equal(player1)
    expect(envido.finished).to.be.true
    expect(envido.winner).to.equal(team1)
    expect(envido.getPointsToGive()).to.equal(4)
    done()
  })

  it("should handle ENVIDO -> REAL_ENVIDO -> QUIERO with point declarations awarding 5 points", (done) => {
    const envido = Envido([team1, team2], options, table)
    envido.sayEnvido(EEnvidoCommand.ENVIDO, player1)
    expect(envido.stake).to.equal(2)
    expect(envido.declineStake).to.equal(1)
    envido.sayEnvido(EEnvidoCommand.REAL_ENVIDO, player3)
    expect(envido.stake).to.equal(5)
    expect(envido.declineStake).to.equal(2)
    envido.sayAnswer(player1, true)
    expect(envido.accepted).to.be.true
    expect(envido.players.map((p) => p.key)).to.include.members(["p1", "p3", "p2", "p4"])
    envido.sayPoints(player1, 32)
    envido.sayPoints(player3, 27)
    envido.sayPoints(player2, 25)
    envido.sayPoints(player4, 28)
    expect(envido.winningPlayer).to.equal(player1)
    expect(envido.finished).to.be.true
    expect(envido.winner).to.equal(team1)
    expect(envido.getPointsToGive()).to.equal(5)
    done()
  })

  it("should handle ENVIDO -> REAL_ENVIDO -> FALTA_ENVIDO -> QUIERO with point declarations awarding 18 points", (done) => {
    const envido = Envido([team1, team2], options, table)
    envido.sayEnvido(EEnvidoCommand.ENVIDO, player1)
    expect(envido.stake).to.equal(2)
    expect(envido.declineStake).to.equal(1)
    envido.sayEnvido(EEnvidoCommand.REAL_ENVIDO, player3)
    expect(envido.stake).to.equal(5)
    expect(envido.declineStake).to.equal(2)
    envido.sayEnvido(EEnvidoCommand.FALTA_ENVIDO, player1)
    expect(envido.declineStake).to.equal(5)
    expect(envido.teamIdx).to.equal(0)
    expect(envido.players.map((p) => p.key)).to.include.members(["p3", "p4"])
    envido.sayAnswer(player3, true)
    expect(envido.accepted).to.be.true
    expect(envido.players.map((p) => p.key)).to.include.members(["p1", "p3", "p2", "p4"])
    envido.sayPoints(player1, 32)
    envido.sayPoints(player3, 27)
    envido.sayPoints(player2, 25)
    envido.sayPoints(player4, 28)
    expect(envido.winningPlayer).to.equal(player1)
    expect(envido.finished).to.be.true
    expect(envido.winner).to.equal(team1)
    expect(envido.getPointsToGive()).to.equal(18)
    done()
  })

  it("should cycle turns correctly using turn generator", (done) => {
    const envido = Envido([team1, team2], options, table)
    envido.sayEnvido(EEnvidoCommand.ENVIDO, player1)
    envido.sayAnswer(player3, true)
    let result = envido.getNextPlayer()
    if (result.done || !result.value) {
      throw new Error("Unexpected generator completion")
    }
    expect(result.value.currentPlayer).to.equal(player1)
    result = envido.getNextPlayer()
    if (result.done || !result.value) {
      throw new Error("Unexpected generator completion")
    }
    expect(result.value.currentPlayer).to.equal(player3)
    result = envido.getNextPlayer()
    if (result.done || !result.value) {
      throw new Error("Unexpected generator completion")
    }
    expect(result.value.currentPlayer).to.equal(player2)
    result = envido.getNextPlayer()
    if (result.done || !result.value) {
      throw new Error("Unexpected generator completion")
    }
    expect(result.value.currentPlayer).to.equal(player4)
    result = envido.getNextPlayer()
    if (result.done || !result.value) {
      throw new Error("Unexpected generator completion")
    }
    expect(result.value.currentPlayer).to.equal(player1)
    done()
  })

  it("should handle disabled player in turn sequence", (done) => {
    const envido = Envido([team1, team2], options, table)
    player3.disable()
    envido.sayEnvido(EEnvidoCommand.ENVIDO, player1)
    envido.sayAnswer(player4, true)
    let result = envido.getNextPlayer()
    if (result.done || !result.value) {
      throw new Error("Unexpected generator completion")
    }
    expect(result.value.currentPlayer).to.equal(player1)
    result = envido.getNextPlayer()
    if (result.done || !result.value) {
      throw new Error("Unexpected generator completion")
    }
    expect(result.value.currentPlayer).to.equal(player2)
    result = envido.getNextPlayer()
    if (result.done || !result.value) {
      throw new Error("Unexpected generator completion")
    }
    expect(result.value.currentPlayer).to.equal(player4)
    result = envido.getNextPlayer()
    if (result.done || !result.value) {
      throw new Error("Unexpected generator completion")
    }
    expect(result.value.currentPlayer).to.equal(player1)
    done()
  })

  it("should throw error when saying points before envido is accepted", (done) => {
    const envido = Envido([team1, team2], options, table)
    envido.sayEnvido(EEnvidoCommand.ENVIDO, player1)
    expect(() => envido.sayPoints(player1, 32)).to.throw(GAME_ERROR.ENVIDO_NOT_ACCEPTED)
    done()
  })

  it("should prevent player with flor from saying ENVIDO when flor is enabled", (done) => {
    options.flor = true
    player1.setHand(["7c", "6c", "5c"])
    const envido = Envido([team1, team2], options, table)
    expect(() => envido.sayEnvido(EEnvidoCommand.ENVIDO, player1)).to.throw(
      GAME_ERROR.INVALID_COMMAND
    )
    done()
  })
})
