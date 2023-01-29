import { Lobby } from "../lib"
import { IRound } from "../lib/types"
;(async () => {
  const trucoshi = Lobby()

  trucoshi.addPlayer("lukini", "lukini").setReady(true)
  trucoshi.addPlayer("denoph", "denoph").setReady(true)
  trucoshi.addPlayer("guada", "guada").setReady(true)
  trucoshi.addPlayer("juli", "juli").setReady(true)
  trucoshi.addPlayer("day", "day").setReady(true)
  trucoshi.addPlayer("fran", "fran").setReady(true) 

  trucoshi
    .startMatch()
    .onTurn(async (play) => {
      if (!play.player) {
        return
      }
      const name = play.player?.id.toUpperCase()
      console.log(`=== Mano ${play.handIdx} === Ronda ${play.roundIdx} === Turno de ${name} ===`)
      play.teams.map((team, id) =>
        console.log(`=== Team ${id} = ${team.points.malas} malas ${team.points.buenas} buenas ===`)
      )
      console.log(
        play.rounds && play.rounds.length
          ? play.rounds.map((round: IRound) =>
              round.cards.length ? round.cards.map((c) => [c.player.id, c.card]) : ""
            )
          : ""
      )

      const randomIdx = Math.round(Math.random() * (play.player.hand.length - 1))
      const handString = JSON.stringify(play.player.hand)
      const card = play.use(randomIdx)

      console.log(`\n${handString}\nUsing ${card}`)
      console.log(
        play.rounds && play.rounds.length
          ? play.rounds.map((round: IRound) =>
              round.cards.length ? round.cards.map((c) => [c.player.id, c.card]) : ""
            )
          : ""
      )
    })
    .onWinner(async (winner, teams) => {
      console.log("\n")
      teams.map((t, i) =>
        console.log(
          `Equipo ${i}: ${t.players.map((p) => ` ${p.id}`)} === ${t.points.malas} malas ${
            t.points.buenas
          } buenas`
        )
      )
      console.log(`\nEquipo Ganador:${winner.players.map((p) => ` ${p.id}`)}`)
    })
    .begin()
})()
