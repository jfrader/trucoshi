import { expect } from "chai"
import { EAnswerCommand, EEnvidoAnswerCommand, EFlorCommand, ESayCommand } from "../../src/types"
import { IPlayInstance, Lobby } from "../../src/truco"
import { randomUUID } from "crypto"

function sayPlay(play: IPlayInstance, ...args: Parameters<typeof play.say>) {
  const r = play.say(...args)
  if (r === null) {
    process.abort()
  }

  return r
}

describe("Trucoshi Lib", () => {
  it("should play an entire match of 6", (done) => {
    const trucoshi = Lobby("testmatch1", "lucas")

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
      const lobby = Lobby(randomUUID(), "lucas")

      const randomPlayersQuantity = [0, 2, 4]

      const candidates = ["lucas", "guada", "juli", "day", "gaspar", "fran"]

      candidates.splice(0, randomPlayersQuantity[Math.floor(Math.random() * 3)])

      const promises = candidates.map((n, i) =>
        lobby.addPlayer({ key: n, name: n, session: n }).then((player) => {
          player.setReady(true)
          player.setIdx(i)
        })
      )

      lobby.setOptions({ flor: Math.random() > 0.5 })

      Promise.allSettled(promises).then(() => {
        const match = lobby.startMatch(15)

        match
          .onEnvido(async (play, pointsRound) => {
            if (!play.player || (!play.player._commands.size && !pointsRound)) {
              console.log(play.getHand().roundsLog)
              console.log({
                onEnvido: true,
                players: lobby.players.length,
                idx: play.player?.idx,
                hand: play.player?.hand,
                commands: play.player?.commands,
                hasFlor: play.player?.hasFlor,
              })
              return process.abort()
            }

            if (pointsRound) {
              if (play.player.commands.includes(ESayCommand.PASO) && Math.random() > 0.75) {
                sayPlay(play, ESayCommand.PASO, play.player)
                return
              }
              if (
                play.player.commands.includes(EEnvidoAnswerCommand.SON_BUENAS) &&
                Math.random() > 0.51
              ) {
                sayPlay(play, EEnvidoAnswerCommand.SON_BUENAS, play.player)
                return
              }

              const randomIdx = Math.floor(Math.random() * play.player.envido.length)
              sayPlay(play, play.player.envido[randomIdx].value || 0, play.player)
              return
            }

            if (play.player._commands.has(EFlorCommand.FLOR)) {
              sayPlay(play, EFlorCommand.FLOR, play.player)
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

            sayPlay(play, EAnswerCommand.QUIERO, play.player)
          })

          .onFlor(async (play) => {
            if (!play.player || !play.player._commands.size) {
              console.log(play.getHand().roundsLog)
              console.log({
                onFlor: true,
                players: lobby.players.length,
                idx: play.player?.idx,
                hand: play.player?.hand,
                commands: play.player?.commands,
                hasFlor: play.player?.hasFlor,
              })
              return process.abort()
            }

            if (play.player._commands.has(EFlorCommand.FLOR)) {
              if (play.player._commands.has(EFlorCommand.CONTRAFLOR) && Math.random() > 0.49) {
                if (Math.random() > 0.51) {
                  if (Math.random() > 50) {
                    sayPlay(play, EFlorCommand.ACHICO, play.player)
                    return
                  }

                  sayPlay(play, EFlorCommand.CONTRAFLOR, play.player)
                  return
                }

                sayPlay(play, EFlorCommand.CONTRAFLOR_AL_RESTO, play.player)
                return
              }

              sayPlay(play, EFlorCommand.FLOR, play.player)
              return
            }

            if (Math.random() > 0.75) {
              sayPlay(play, EAnswerCommand.NO_QUIERO, play.player)
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

            sayPlay(play, EAnswerCommand.QUIERO, play.player)
          })
          .onTruco(async (play) => {
            const hand = play.getHand()

            if (!play.player || !play.player._commands.size) {
              console.log(play.getHand().roundsLog)
              console.log({
                onTruco: true,
                players: lobby.players.length,
                idx: play.player?.idx,
                hand: play.player?.hand,
                commands: play.player?.commands,
                hasFlor: play.player?.hasFlor,
                hasSaidFlor: play.player?.hasSaidFlor,
                handState: hand.state,
              })
              return process.abort()
            }

            if (play.player._commands.has(EFlorCommand.FLOR)) {
              sayPlay(play, EFlorCommand.FLOR, play.player)
              return
            }

            if (!play.player._commands.has(EAnswerCommand.QUIERO)) {
              console.log({
                onTruco: true,
                handRounds: hand.rounds.length,
                trucoAnswer: hand.truco.answer,
                envidoAnswer: hand.envido.answer,
                florState: hand.flor.state,
                florAnswered: hand.flor.teamIdx,
                idx: play.player.idx,
                disabled: play.player.disabled,
                usedHand: play.player.usedHand.length,
                commands: play.player.commands,
                hand: play.player.hand,
                hasFlor: play.player.hasFlor,
                hasSaidFlor: play.player?.hasSaidFlor,
              })
              console.log(play.getHand().roundsLog)
              return process.abort()
            }

            if (play.player.envido.length > 1 && Math.random() < 75) {
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

              sayPlay(play, new_command, play.player)
              return
            }

            sayPlay(play, EAnswerCommand.QUIERO, play.player)
          })
          .onTurn(async (play) => {
            if (!play.player) {
              return
            }

            if (play.player._commands.has(EFlorCommand.FLOR)) {
              sayPlay(play, EFlorCommand.FLOR, play.player)
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

              sayPlay(play, new_command, play.player)
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

    async function awaitGames() {
      let played = 0
      let playedProm: Promise<any>[] = []
      while (played < 250) {
        played++
        // await new Promise((resolve) => {
        //   playGame(resolve)
        // })
        playedProm.push(
          new Promise((resolve) => {
            playGame(resolve)
          })
        )
      }

      await Promise.allSettled(playedProm)
    }

    ;(async () => {
      await awaitGames()
      done()
    })()
  })
})
