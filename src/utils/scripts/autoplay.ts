import { CARDS_HUMAN_READABLE } from "../../lib/constants"
import { IRound, Lobby } from "../../truco"
;(async () => {
  const trucoshi = Lobby("testmatch1", "lucas")

  const promises = ["lucas", "guada", "juli", "day", "gaspar", "fran"].map((n, i) =>
    trucoshi.addPlayer({ key: n, name: n, session: n }).then((player) => {
      player.setReady(true)
      player.setIdx(i)
    })
  )
  await Promise.allSettled(promises)

  trucoshi
    .startMatch()
    .onTurn(async (play) => {
      if (!play.player) {
        return
      }
      const name = play.player?.name.toUpperCase()
      console.log(`=== Mano ${play.handIdx} === Ronda ${play.roundIdx} === Turno de ${name} ===`)
      play.teams.map((team, id) =>
        console.log(`=== Team ${id} = ${team.points.malas} malas ${team.points.buenas} buenas ===`)
      )
      console.log(
        play.rounds && play.rounds.length
          ? play.rounds.map((round: IRound) =>
              round.cards.length ? round.cards.map((c) => [c.player.name, c.card]) : ""
            )
          : ""
      )

      const randomIdx = Math.round(Math.random() * (play.player.hand.length - 1))
      const handString = JSON.stringify(play.player.hand)
      const card = play.use(randomIdx, play.player.hand[randomIdx])

      console.log(`\n${handString}\nUsing ${card}`)
      console.log(
        play.rounds && play.rounds.length
          ? play.rounds.map((round: IRound) =>
              round.cards.length
                ? round.cards.map((c) => [c.player.name, CARDS_HUMAN_READABLE[c.card] || "xx"])
                : ""
            )
          : ""
      )
    })
    .onWinner(async (winner, teams) => {
      console.log("\n")
      console.log(`\nEquipo Ganador:${winner.players.map((p) => ` ${p.name}`)}`)
    })
    .begin()
})()
