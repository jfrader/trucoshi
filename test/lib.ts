import { Lobby } from "../src/lib"
import { expect } from "chai"

describe("Trucoshi Lib", () => {
  it("should play an entire match", (done) => {
    const trucoshi = Lobby()

    const promises = [
      trucoshi.addPlayer("lukini", "lukini", "lukini").then((player) => player.setReady(true)),
      trucoshi.addPlayer("denoph", "denoph", "denoph").then((player) => player.setReady(true)),
      trucoshi.addPlayer("guada", "guada", "guada").then((player) => player.setReady(true)),
      trucoshi.addPlayer("juli", "juli", "juli").then((player) => player.setReady(true)),
      trucoshi.addPlayer("day", "day", "day").then((player) => player.setReady(true)),
      trucoshi.addPlayer("fran", "fran", "fran").then((player) => player.setReady(true)),
    ]

    Promise.allSettled(promises).then(() => {
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
})
