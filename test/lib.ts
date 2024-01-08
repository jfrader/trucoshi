import { Lobby } from "../src/lib"
import { expect } from "chai"
import { EAnswerCommand, EEnvidoAnswerCommand, ESayCommand } from "../src/types"

describe("Trucoshi Lib", () => {
  it("should play an entire match of 6", (done) => {
    const trucoshi = Lobby("testmatch1")

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
          const randomIdx = Math.round(Math.random() * (play.player.hand.length))
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

  it("should play 100 random matches of 2, 4 or 6 players in parallel", (done) => {
    const playGame = (finished) => {
      const trucoshi = Lobby("testmatch2")

      const randomPlayersQuantity = [0, 2, 4]

      const promises = [
        () => trucoshi.addPlayer("luk", "luk", "luk").then((player) => player.setReady(true)),
        () => trucoshi.addPlayer("deno", "deno", "deno").then((player) => player.setReady(true)),
        () => trucoshi.addPlayer("guada", "guada", "guada").then((player) => player.setReady(true)),
        () => trucoshi.addPlayer("juli", "juli", "juli").then((player) => player.setReady(true)),
        () => trucoshi.addPlayer("day", "day", "day").then((player) => player.setReady(true)),
        () => trucoshi.addPlayer("fran", "fran", "fran").then((player) => player.setReady(true)),
      ]

      promises.splice(0, randomPlayersQuantity[Math.floor(Math.random() * 3)])

      Promise.allSettled(promises.map((p) => p())).then(() => {
        trucoshi
          .startMatch(15)
          .onEnvido(async (play, pointsRound) => {
            if (!play.player) {
              return
            }

            if (pointsRound) {
              if (
                play.player.commands.includes(EEnvidoAnswerCommand.SON_BUENAS) &&
                Math.random() > 0.51
              ) {
                play.say(EEnvidoAnswerCommand.SON_BUENAS, play.player)
                return
              }

              const randomIdx = Math.floor(Math.random() * (play.player.envido.length))
              play.say(play.player.envido[randomIdx] || 0, play.player)
              return
            }

            play.say(EAnswerCommand.QUIERO, play.player)
          })
          .onTruco(async (play) => {
            if (!play.player) {
              return
            }
            play.say(EAnswerCommand.QUIERO, play.player)
          })
          .onTurn(async (play) => {
            if (!play.player) {
              return
            }

            if (Math.random() > 0.51) {
              let randomIdx = Math.floor(Math.random() * (play.player.commands.length))

              let i = 0
              while (
                play.player.commands.length > 1 &&
                i < 5 &&
                play.player.commands[randomIdx] === ESayCommand.MAZO
              ) {
                randomIdx = Math.floor(Math.random() * (play.player.commands.length))
                i++
              }

              play.say(play.player.commands[randomIdx], play.player)
              return
            }

            const randomIdx = Math.floor(Math.random() * (play.player.hand.length))
            play.use(randomIdx, play.player.hand[randomIdx])
          })
          .onWinner(async (winner, teams) => {
            expect(winner).to.haveOwnProperty("players")
            expect(teams.find((team) => team.players.at(0)?.key === winner.players.at(0)?.key))
            finished()
          })
          .begin()
      })
    }

    let played = 0
    let playedProm: Promise<any>[] = []

    while (played < 100) {
      played++
      playedProm.push(
        new Promise((resolve) => {
          playGame(resolve)
        })
      )
    }

    Promise.allSettled(playedProm).finally(done)
  })
})
