import * as readline from "readline"
import { COLORS } from "../lib/constants"
import { Match, Player, Team } from "../lib/trucoshi"
import { IRound } from "../lib/types"
;(async () => {
  const player1 = Player("lukini", 0)
  const player2 = Player("guada", 0)
  const player3 = Player("denoph", 1)
  const player4 = Player("juli", 1)

  const team1 = Team(COLORS[0], [player1, player2])
  const team2 = Team(COLORS[1], [player3, player4])

  const match = Match([team1, team2], 9)

  while (!match.winner) {
    const play = match.play()

    if (!play || !play.player) {
      break
    }

    const name = play.player.id.toUpperCase()

    process.stdout.write("\u001B[2J\u001B[0;0f")
    process.stdout.write("\u001B[0;0f")

    console.log(`=== Mano ${play.handIdx} === Ronda ${play.roundIdx} === Turno de ${name} ===`)

    process.stdout.write("\u001B[2;0f")

    match.teams.map((team, id) => console.log(`=== Team ${id} = ${team.points} Puntos ===`))

    process.stdout.write("\u001B[5;0f")

    console.log(
      play.rounds && play.rounds.length
        ? play.rounds.map((round: IRound) =>
            round.cards.length ? round.cards.map((c) => [c.player.id, c.card]) : ""
          )
        : ""
    )

    const prom = () =>
      new Promise<void>((resolve) => {
        const rl = readline.createInterface(process.stdin, process.stdout)
        rl.setPrompt(
          `\n${play.player?.id} elije una carta [1, 2, 3]: ${JSON.stringify(play.player?.hand)}\n`
        )
        rl.prompt()
        rl.on("line", (idx: string) => {
          const playedCard = play.use(Number(idx) - 1)
          if (!playedCard) {
            rl.close()
            return (async () => {
              await prom()
              resolve()
            })()
          }
          const handString = JSON.stringify(play.player?.hand)
          process.stdout.write("\u001B[7;0f")
          console.log(`\n${handString}\nUsing ${playedCard}`)
          process.stdout.write("\u001B[10;0f")
          console.log(
            play.rounds && play.rounds.length
              ? play.rounds.map((round: IRound) =>
                  round.cards.length ? round.cards.map((c) => [c.player.id, c.card]) : ""
                )
              : ""
          )
          rl.close()
          resolve()
        })
      })

    await prom()
  }

  process.stdout.write("\u001B[2J\u001B[2;0f")
  match.teams.map((t, i) =>
    console.log(`Equipo ${i}: ${t.players.map((p) => ` ${p.id}`)} === ${t.points} puntos`)
  )
  console.log(`\nEquipo Ganador:${match.winner?.players.map((p) => ` ${p.id}`)}`)
})()
