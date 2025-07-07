import { expect } from "chai"
import { EAnswerCommand, EEnvidoAnswerCommand, EFlorCommand, ESayCommand } from "../../src/types"
import { Lobby } from "../../src/truco"

describe("Trucoshi Lib", () => {
  it("should play an entire match of 6", (done) => {
    const trucoshi = Lobby("testmatch1")

    const promises = ["lucas", "guada", "juli", "day", "gaspar", "fran"].map((n, i) =>
      trucoshi.addPlayer({ key: n, name: n, session: n }).then((player) => {
        player.setReady(true)
        player.setIdx(i)
      })
    )

    Promise.allSettled(promises).then(() => {
      trucoshi
        .startMatch()
        .onTurn(async (play) => {
          if (!play.player) {
            return
          }
          const randomIdx = Math.round(Math.random() * play.player.hand.length)
          play.use(randomIdx, play.player.hand[randomIdx])
        })
        .onWinner(async (winner) => {
          expect(winner).to.haveOwnProperty("players")
          expect(winner.points.buenas).to.be.greaterThanOrEqual(9)
          done()
        })
        .begin()
    })
  })

  it("should play 100 random matches of 2, 4 or 6 players in parallel", (done) => {
    const playGame = (finished) => {
      const trucoshi = Lobby("testmatch2")

      const randomPlayersQuantity = [0, 2, 4]

      const promises = ["lucas", "guada", "juli", "day", "gaspar", "fran"].map((n, i) =>
        trucoshi.addPlayer({ key: n, name: n, session: n }).then((player) => {
          player.setReady(true)
          player.setIdx(i)
        })
      )

      promises.splice(0, randomPlayersQuantity[Math.floor(Math.random() * 3)])

      Promise.allSettled(promises).then(() => {
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

              const randomIdx = Math.floor(Math.random() * play.player.envido.length)
              play.say(play.player.envido[randomIdx].value || 0, play.player)
              return
            }

            if (play.player._commands.has(EFlorCommand.FLOR)) {
              play.say(EFlorCommand.FLOR, play.player)
              return
            }

            if (!play.player._commands.has(EAnswerCommand.QUIERO)) {
              console.log({
                onEnvido: true,
                idx: play.player.idx,
                commands: play.player.commands,
                hand: play.player.hand,
                hasFlor: play.player.hasFlor,
              })
              console.log(play.getHand().roundsLog)
              return process.abort()
            }

            play.say(EAnswerCommand.QUIERO, play.player)
          })

          .onFlor(async (play) => {
            if (!play.player) {
              return
            }

            if (play.player._commands.has(EFlorCommand.FLOR)) {
              if (play.player._commands.has(EFlorCommand.CONTRAFLOR) && Math.random() > 0.49) {
                if (Math.random() > 0.51) {
                  if (Math.random() > 50) {
                    play.say(EFlorCommand.ACHICO, play.player)
                    return
                  }

                  play.say(EFlorCommand.CONTRAFLOR, play.player)
                  return
                }

                play.say(EFlorCommand.CONTRAFLOR_AL_RESTO, play.player)
                return
              }

              play.say(EFlorCommand.FLOR, play.player)
              return
            }

            if (Math.random() > 0.75) {
              play.say(EAnswerCommand.NO_QUIERO, play.player)
              return
            }

            if (!play.player._commands.has(EAnswerCommand.QUIERO)) {
              console.log({
                onFlor: true,
                florAnswered: play.getHand().flor.teamIdx,
                idx: play.player.idx,
                commands: play.player.commands,
                hand: play.player.hand,
                hasFlor: play.player.hasFlor,
              })
              console.log(play.getHand().roundsLog)
              return process.abort()
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

            if (play.player._commands.has(EFlorCommand.FLOR)) {
              play.say(EFlorCommand.FLOR, play.player)
              return
            }

            if (play.player.commands.length && Math.random() > 0.51) {
              let randomIdx = Math.floor(Math.random() * play.player.commands.length)

              let i = 0
              while (
                play.player.commands.length > 1 &&
                i < 5 &&
                play.player.commands[randomIdx] === ESayCommand.MAZO
              ) {
                randomIdx = Math.floor(Math.random() * play.player.commands.length)
                i++
              }

              const new_command = play.player.commands[randomIdx]

              play.say(new_command, play.player)
              return
            }

            const randomIdx = Math.floor(Math.random() * play.player.hand.length)
            play.use(randomIdx, play.player.hand[randomIdx])
          })
          .onWinner(async (winner) => {
            expect(winner).to.haveOwnProperty("players")
            expect(winner.points.buenas).to.be.greaterThanOrEqual(9)
            finished()
          })
          .begin()
      })
    }

    let played = 0
    let playedProm: Promise<any>[] = []

    while (played < 500) {
      played++
      playedProm.push(
        new Promise((resolve, reject) => {
          playGame(resolve)
          setTimeout(() => reject("timeout"), 10000)
        })
      )
    }

    Promise.allSettled(playedProm).then((r) => {
      console.log("rejected: ", r.filter(a=> a.status === "rejected").length)
    }).finally(done)
  })
})
