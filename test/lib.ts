import { Lobby } from "../src/lib"
import { expect } from "chai"

describe("Match", () => {
  it("should play an entire match", (done) => {
    const trucoshi = Lobby()

    trucoshi.addPlayer("lukini", "lukini", "lukini").setReady(true)
    trucoshi.addPlayer("denoph", "denoph", "denoph").setReady(true)
    trucoshi.addPlayer("guada", "guada", "guada").setReady(true)
    trucoshi.addPlayer("juli", "juli", "juli").setReady(true)
    trucoshi.addPlayer("day", "day", "day").setReady(true)
    trucoshi.addPlayer("fran", "fran", "fran").setReady(true)

    trucoshi
      .startMatch()
      .onTurn(async (play) => {
        if (!play.player) {
          return
        }
        const randomIdx = Math.round(Math.random() * (play.player.hand.length - 1))
        play.use(randomIdx, play.player.hand[randomIdx])
      })
      .onWinner(async (winner, teams) => {
        expect(winner).to.haveOwnProperty("players")
        expect(teams.find((team) => team.players.at(0)?.key === winner.players.at(0)?.key))
        done()
      })
      .begin()
  })
})
