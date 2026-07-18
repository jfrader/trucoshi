import { expect } from "chai"

import {
  EFlorCommand,
  EAnswerCommand,
  ITeam,
  ILobbyOptions,
  IPlayer,
  GAME_ERROR,
} from "../../src/types"
import { ITable, Table } from "../../src/lib"
import { DEFAULT_LOBBY_OPTIONS, Player, Team } from "../../src/truco"
import { Flor } from "../../src/truco/Flor"

describe("Trucoshi Flor", () => {
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

    // Set hands for Flor point calculations
    player1.setHand(["7c", "6c", "5c"]) // Flor: 38 (7+6+5+20)
    player2.setHand(["5o", "1o", "6e"]) // No Flor
    player3.setHand(["4e", "3e", "2e"]) // Flor: 29 (4+3+2+20)
    player4.setHand(["7b", "1b", "5b"]) // Flor: 33 (7+1+5+20)

    // Create teams
    team1 = Team(0, "Team 1").setPlayers([player1, player2])
    team2 = Team(1, "Team 2").setPlayers([player3, player4])

    // Create options with flor enabled
    options = {
      ...DEFAULT_LOBBY_OPTIONS,
      matchPoint: 9,
      faltaEnvido: 1,
      flor: true,
    }

    // Create table
    table = Table("test-session", [player1, player3, player2, player4]) // Alternating order
    table.forehandIdx = 0 // Player 1 is forehand
  })

  it("should award 3 points when FLOR is unopposed", (done) => {
    const flor = Flor([team1, team2], options, table)
    flor.sayFlor(player1)
    expect(flor.state).to.equal(3)
    expect(flor.stake).to.equal(3)
    expect(flor.declineStake).to.equal(0)
    expect(flor.teamIdx).to.equal(0)
    expect(flor.winningPlayer).to.equal(player1)
    expect(flor.players.map((p) => p.key)).to.include.members(["p3", "p4"])
    expect(flor.candidates.map((p) => p.key)).to.include.members(["p1"])
    // Simulate team2 players with Flor playing cards to skip declaration
    team2.players.forEach((p) => p.useCard(0, p.hand[0]))
    flor.sayFlor(player1) // Re-call to trigger resolution
    expect(flor.finished).to.be.true
    expect(flor.winner).to.equal(team1)
    expect(flor.getPointsToGive()).to.equal(3)
    done()
  })

  it("should award 4 points when FLOR is accepted (38 vs 29)", (done) => {
    const flor = Flor([team1, team2], options, table)
    flor.sayFlor(player1)
    expect(flor.state).to.equal(3)
    expect(flor.stake).to.equal(3)
    flor.sayFlor(player3)
    expect(flor.state).to.equal(3)
    expect(flor.stake).to.equal(4)
    expect(flor.declineStake).to.equal(3)
    expect(flor.accepted).to.be.true
    expect(flor.answered).to.be.true
    expect(flor.candidates.map((p) => p.key)).to.include.members(["p1", "p3"])
    expect(flor.winners.map(({ player }) => player.key)).to.include.members(["p1", "p3"])
    expect(flor.winningPlayer).to.equal(player1)
    expect(flor.winner).to.equal(team1)
    expect(flor.getPointsToGive()).to.equal(4)
    done()
  })

  it("should award 4 points when CONTRAFLOR is declined after FLOR", (done) => {
    const flor = Flor([team1, team2], options, table)
    flor.sayFlor(player1)
    expect(flor.state).to.equal(3)
    flor.sayContraflor(player3)
    expect(flor.state).to.equal(4)
    expect(flor.stake).to.equal(6)
    expect(flor.declineStake).to.equal(4)
    expect(flor.teamIdx).to.equal(1)
    expect(flor.players.map((p) => p.key)).to.include.members(["p1"])
    flor.sayAnswer(player1, false)
    expect(flor.finished).to.be.true
    expect(flor.answered).to.be.true
    expect(flor.answer).to.be.false
    expect(flor.winner).to.equal(team2)
    expect(flor.getPointsToGive()).to.equal(4)
    done()
  })

  it("should award 6 points when CONTRAFLOR is accepted (38 vs 29)", (done) => {
    const flor = Flor([team1, team2], options, table)
    flor.sayFlor(player1)
    expect(flor.state).to.equal(3)
    flor.sayContraflor(player3)
    expect(flor.state).to.equal(4)
    expect(flor.stake).to.equal(6)
    flor.sayAnswer(player1, true)
    expect(flor.state).to.equal(4)
    expect(flor.accepted).to.be.true
    expect(flor.answered).to.be.true
    expect(flor.finished).to.be.true
    expect(flor.winningPlayer).to.equal(player1)
    expect(flor.winner).to.equal(team1)
    expect(flor.getPointsToGive()).to.equal(6)
    done()
  })

  it("should award 18 points when CONTRAFLOR_AL_RESTO is accepted (38 vs 29)", (done) => {
    const flor = Flor([team1, team2], options, table)
    flor.sayFlor(player1)
    expect(flor.state).to.equal(3)
    flor.sayContraflor(player3)
    expect(flor.state).to.equal(4)
    flor.sayContraflorAlResto(player1)
    expect(flor.state).to.equal(5)
    expect(flor.stake).to.equal(18) // matchPoint * 2 = 9 * 2
    expect(flor.declineStake).to.equal(6)
    expect(flor.teamIdx).to.equal(0)
    flor.sayAnswer(player3, true)
    expect(flor.state).to.equal(5)
    expect(flor.accepted).to.be.true
    expect(flor.answered).to.be.true
    expect(flor.finished).to.be.true
    expect(flor.winningPlayer).to.equal(player1)
    expect(flor.winner).to.equal(team1)
    expect(flor.getPointsToGive()).to.equal(18)
    done()
  })

  it("should award 6 points when CONTRAFLOR_AL_RESTO is declined after CONTRAFLOR", (done) => {
    const flor = Flor([team1, team2], options, table)
    flor.sayFlor(player1)
    expect(flor.state).to.equal(3)
    flor.sayContraflor(player3)
    expect(flor.state).to.equal(4)
    flor.sayContraflorAlResto(player1)
    expect(flor.state).to.equal(5)
    expect(flor.stake).to.equal(18)
    expect(flor.declineStake).to.equal(6)
    flor.sayAnswer(player3, false)
    expect(flor.finished).to.be.true
    expect(flor.answered).to.be.true
    expect(flor.answer).to.be.false
    expect(flor.winner).to.equal(team1)
    expect(flor.getPointsToGive()).to.equal(6)
    done()
  })

  it("should award 3 points when ACHICO is called after FLOR", (done) => {
    const flor = Flor([team1, team2], options, table)
    flor.sayFlor(player1)
    expect(flor.state).to.equal(3)
    flor.sayAchico(player3)
    expect(flor.finished).to.be.true
    expect(flor.answered).to.be.true
    expect(flor.accepted).to.be.false
    expect(flor.winner).to.equal(team1)
    expect(flor.stake).to.equal(3)
    expect(flor.declineStake).to.equal(3)
    expect(flor.getPointsToGive()).to.equal(3)
    done()
  })

  it("should award 4 points when CONTRAFLOR is declined with NO_QUIERO", (done) => {
    const flor = Flor([team1, team2], options, table)
    flor.sayFlor(player1)
    expect(flor.state).to.equal(3)
    flor.sayContraflor(player3)
    expect(flor.state).to.equal(4)
    expect(flor.stake).to.equal(6)
    expect(flor.declineStake).to.equal(4)
    expect(flor.teamIdx).to.equal(1)
    expect(flor.players.map((p) => p.key)).to.include.members(["p1"])
    flor.sayAnswer(player1, false)
    expect(flor.finished).to.be.true
    expect(flor.answered).to.be.true
    expect(flor.answer).to.be.false
    expect(flor.winner).to.equal(team2)
    expect(flor.getPointsToGive()).to.equal(4)
    done()
  })

  it("should handle tie in Flor points (33 vs 33) with forehand advantage", (done) => {
    player1.setHand(["7b", "1b", "5b"]) // Flor: 33 (7+1+5+20)
    player3.setHand(["7b", "1b", "5b"]) // Flor: 33
    const flor = Flor([team1, team2], options, table)
    flor.sayFlor(player1)
    expect(flor.state).to.equal(3)
    flor.sayFlor(player3)
    expect(flor.accepted).to.be.true
    expect(flor.winners.map(({ points }) => points)).to.include.members([33, 33])
    expect(flor.winningPlayer).to.equal(player1) // p1 wins due to forehand
    expect(flor.winner).to.equal(team1)
    expect(flor.getPointsToGive()).to.equal(4)
    done()
  })

  it("should cycle turns correctly using turn generator", (done) => {
    const flor = Flor([team1, team2], options, table)
    flor.sayFlor(player1)
    expect(flor.players.map((p) => p.key)).to.include.members(["p3", "p4"])
    let result = flor.getNextPlayer()
    if (result.done || !result.value) {
      throw new Error("Unexpected generator completion")
    }
    expect(result.value.currentPlayer).to.equal(player3)
    result = flor.getNextPlayer()
    if (result.done || !result.value) {
      throw new Error("Unexpected generator completion")
    }
    expect(result.value.currentPlayer).to.equal(player4)
    result = flor.getNextPlayer()
    if (result.done || !result.value) {
      throw new Error("Unexpected generator completion")
    }
    expect(result.value.currentPlayer).to.equal(player3)
    done()
  })

  it("should handle disabled player in turn sequence", (done) => {
    const flor = Flor([team1, team2], options, table)
    player3.disable()
    flor.sayFlor(player1)
    expect(flor.players.map((p) => p.key)).to.include.members(["p4"])
    let result = flor.getNextPlayer()
    if (result.done || !result.value) {
      throw new Error("Unexpected generator completion")
    }
    expect(result.value.currentPlayer).to.equal(player4)
    result = flor.getNextPlayer()
    if (result.done || !result.value) {
      throw new Error("Unexpected generator completion")
    }
    expect(result.value.currentPlayer).to.equal(player4)
    done()
  })

  it("should throw error when player without Flor says FLOR", (done) => {
    const flor = Flor([team1, team2], options, table)
    expect(() => flor.sayFlor(player2)).to.throw(GAME_ERROR.NO_FLOR)
    done()
  })

  it("should throw error when same-team player says CONTRAFLOR", (done) => {
    const flor = Flor([team1, team2], options, table)
    flor.sayFlor(player1)
    expect(() => flor.sayContraflor(player2)).to.throw(GAME_ERROR.INVALID_COMMAND)
    done()
  })

  it("should throw error when saying CONTRAFLOR before FLOR", (done) => {
    const flor = Flor([team1, team2], options, table)
    expect(() => flor.sayContraflor(player3)).to.throw(GAME_ERROR.INVALID_COMMAND)
    done()
  })

  it("should throw error when same-team player answers CONTRAFLOR", (done) => {
    const flor = Flor([team1, team2], options, table)
    flor.sayFlor(player1)
    flor.sayContraflor(player3)
    expect(() => flor.sayAnswer(player4, true)).to.throw(GAME_ERROR.INVALID_COMMAND)
    done()
  })

  it("should throw error when ACHICO is called after CONTRAFLOR", (done) => {
    const flor = Flor([team1, team2], options, table)
    flor.sayFlor(player1)
    flor.sayContraflor(player3)
    expect(flor.state).to.equal(4)
    expect(() => flor.sayAchico(player1)).to.throw(GAME_ERROR.INVALID_COMMAND)
    done()
  })

  it("should throw error when ACHICO is called after CONTRAFLOR_AL_RESTO", (done) => {
    const flor = Flor([team1, team2], options, table)
    flor.sayFlor(player1)
    flor.sayContraflor(player3)
    flor.sayContraflorAlResto(player1)
    expect(flor.state).to.equal(5)
    expect(() => flor.sayAchico(player3)).to.throw(GAME_ERROR.INVALID_COMMAND)
    done()
  })
})
