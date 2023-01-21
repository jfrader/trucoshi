import { Trucoshi } from "../lib"
import { IRound } from "../lib/types"

;(async () => {
  const match = Trucoshi(["lukini", "guada", "day"], ["denoph", "juli", "fran"], 9)

  while (!match.winner) {
    const play = match.play()

    if (!play || !play.player) {
      break
    }

    const name = play.player.id.toUpperCase()
    console.log(`=== Mano ${play.handIdx} === Ronda ${play.roundIdx} === Turno de ${name} ===`)
    match.teams.map((team, id) =>
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
  }

  console.log("\n")
  match.teams.map((t, i) =>
    console.log(
      `Equipo ${i}: ${t.players.map((p) => ` ${p.id}`)} === ${t.points.malas} malas ${
        t.points.buenas
      } buenas`
    )
  )
  console.log(`\nEquipo Ganador:${match.winner?.players.map((p) => ` ${p.id}`)}`)
})()
