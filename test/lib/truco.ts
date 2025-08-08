import { expect } from "chai"

import { ITeam, ILobbyOptions, IPlayer } from "../../src/types"
import { ITable, Table } from "../../src/lib"
import { DEFAULT_LOBBY_OPTIONS, Player, Team } from "../../src/truco"
import { Truco } from "../../src/truco/Truco"

describe("Trucoshi Truco", () => {
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

    // Set hands (mixed suits to avoid flor by default)
    player1.setHand(["7c", "6b", "5c"])
    player2.setHand(["5o", "1o", "6e"])
    player3.setHand(["4e", "3e", "2b"])
    player4.setHand(["7b", "1b", "5c"])

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

  it("should award 1 point when TRUCO is declined", (done) => {
    const truco = Truco([team1, team2])
    truco.sayTruco(player1)
    expect(truco.state).to.equal(2)
    expect(truco.teamIdx).to.equal(0)
    expect(truco.waitingAnswer).to.be.true
    expect(truco.players.map((p) => p.key)).to.include.members(["p3", "p4"])
    truco.sayAnswer(player3, false)
    expect(truco.state).to.equal(1)
    expect(truco.waitingAnswer).to.be.false
    expect(truco.answer).to.be.false
    expect(team2.isTeamDisabled()).to.be.true
    done()
  })

  it("should award 2 points when RE_TRUCO is declined after TRUCO", (done) => {
    const truco = Truco([team1, team2])
    truco.sayTruco(player1)
    expect(truco.state).to.equal(2)
    truco.sayAnswer(player3, true)
    expect(truco.state).to.equal(2)
    expect(truco.waitingAnswer).to.be.false
    expect(truco.answer).to.be.true
    truco.sayTruco(player3)
    expect(truco.state).to.equal(3)
    expect(truco.teamIdx).to.equal(1)
    expect(truco.waitingAnswer).to.be.true
    expect(truco.players.map((p) => p.key)).to.include.members(["p1", "p2"])
    truco.sayAnswer(player1, false)
    expect(truco.state).to.equal(2)
    expect(truco.waitingAnswer).to.be.false
    expect(truco.answer).to.be.false
    expect(team1.isTeamDisabled()).to.be.true
    done()
  })

  it("should award 3 points when VALE_CUATRO is declined after TRUCO and RE_TRUCO", (done) => {
    const truco = Truco([team1, team2])
    truco.sayTruco(player1)
    truco.sayAnswer(player3, true)
    truco.sayTruco(player3)
    expect(truco.state).to.equal(3)
    truco.sayAnswer(player1, true)
    expect(truco.state).to.equal(3)
    expect(truco.waitingAnswer).to.be.false
    expect(truco.answer).to.be.true
    truco.sayTruco(player1)
    expect(truco.state).to.equal(4)
    expect(truco.teamIdx).to.equal(0)
    expect(truco.waitingAnswer).to.be.true
    expect(truco.players.map((p) => p.key)).to.include.members(["p3", "p4"])
    truco.sayAnswer(player3, false)
    expect(truco.state).to.equal(3)
    expect(truco.waitingAnswer).to.be.false
    expect(truco.answer).to.be.false
    expect(team2.isTeamDisabled()).to.be.true
    done()
  })

  it("should not allow further TRUCO calls after VALE_CUATRO", (done) => {
    const truco = Truco([team1, team2])
    truco.sayTruco(player1)
    truco.sayAnswer(player3, true)
    truco.sayTruco(player3)
    truco.sayAnswer(player1, true)
    truco.sayTruco(player1)
    expect(truco.state).to.equal(4)
    truco.sayAnswer(player3, true)
    expect(truco.state).to.equal(4)
    expect(truco.waitingAnswer).to.be.false
    expect(truco.answer).to.be.true
    const before = truco.state
    truco.sayTruco(player3)
    expect(truco.state).to.equal(before)
    expect(truco.waitingAnswer).to.be.false
    done()
  })

  it("should handle TRUCO acceptance and continue game", (done) => {
    const truco = Truco([team1, team2])
    truco.sayTruco(player1)
    expect(truco.state).to.equal(2)
    truco.sayAnswer(player3, true)
    expect(truco.state).to.equal(2)
    expect(truco.waitingAnswer).to.be.false
    expect(truco.answer).to.be.true
    expect(player3.hasSaidTruco).to.be.true
    expect(team1.isTeamDisabled()).to.be.false
    expect(team2.isTeamDisabled()).to.be.false
    done()
  })

  it("should prevent same team from answering their own TRUCO", (done) => {
    const truco = Truco([team1, team2])
    truco.sayTruco(player1)
    expect(truco.teamIdx).to.equal(0)
    const before = { ...truco }
    truco.sayAnswer(player2, true)
    expect(truco.state).to.equal(before.state)
    expect(truco.waitingAnswer).to.equal(before.waitingAnswer)
    expect(truco.answer).to.equal(before.answer)
    done()
  })

  it("should cycle turns correctly using turn generator", (done) => {
    const truco = Truco([team1, team2])
    truco.sayTruco(player1)
    expect(truco.players.map((p) => p.key)).to.include.members(["p3", "p4"])
    let result = truco.getNextPlayer()
    if (result.done || !result.value) {
      throw new Error("Unexpected generator completion")
    }
    expect(result.value.currentPlayer).to.equal(player3)
    result = truco.getNextPlayer()
    if (result.done || !result.value) {
      throw new Error("Unexpected generator completion")
    }
    expect(result.value.currentPlayer).to.equal(player4)
    result = truco.getNextPlayer()
    if (result.done || !result.value) {
      throw new Error("Unexpected generator completion")
    }
    expect(result.value.currentPlayer).to.equal(player3)
    done()
  })

  it("should handle disabled player in turn sequence", (done) => {
    const truco = Truco([team1, team2])
    player3.disable()
    truco.sayTruco(player1)
    expect(truco.players.map((p) => p.key)).to.include.members(["p4"])
    let result = truco.getNextPlayer()
    if (result.done || !result.value) {
      throw new Error("Unexpected generator completion")
    }
    expect(result.value.currentPlayer).to.equal(player4)
    result = truco.getNextPlayer()
    if (result.done || !result.value) {
      throw new Error("Unexpected generator completion")
    }
    expect(result.value.currentPlayer).to.equal(player4)
    done()
  })

  it("should sort players with flor first when flor is enabled", (done) => {
    options.flor = true
    player3.setHand(["7e", "6e", "5e"]) // Flor for player3
    const truco = Truco([team1, team2])
    truco.sayTruco(player1)
    expect(truco.players.map((p) => p.key)).to.deep.equal(["p3", "p4"]) // p3 first due to flor
    expect(player3.hasFlor).to.be.true
    done()
  })
})
