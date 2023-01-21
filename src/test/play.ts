import * as readline from "readline"
import { Trucoshi } from "../lib"
import { EHandState, IRound } from "../lib/types"
;(async () => {
  const match = Trucoshi(["lukini", "guada"], ["denoph", "juli"], 9)

  while (!match.winner) {
    const play = match.play()

    if (!play || !play.player) {
      continue
    }

    const name = play.player.id.toUpperCase()

    // process.stdout.write("\u001B[2J\u001B[0;0f")
    // process.stdout.write("\u001B[0;0f")

    console.log(`=== Mano ${play.handIdx} === Ronda ${play.roundIdx} === Turno de ${name} ===`)

    // process.stdout.write("\u001B[2;0f")

    match.teams.map((team, id) =>
      console.log(`=== Team ${id} = ${team.points.malas} malas ${team.points.buenas} buenas`)
    )

    // process.stdout.write("\u001B[5;0f")

    const canPlay = play.state === EHandState.WAITING_PLAY

    console.log(
      play.rounds && play.rounds.length
        ? play.rounds.map((round: IRound) =>
            round.cards.length ? round.cards.map((c) => [c.player.id, c.card]) : ""
          )
        : ""
    )

    const sayCommand = () => {
      return new Promise<void>((resolve) => {
        const rl = readline.createInterface(process.stdin, process.stdout)
        rl.setPrompt(
          `\n${play.player?.id} elije una accion [${canPlay ? "0," : ""}${play.commands?.map(
            (_c, i) => i + 1
          )}]: ${
            canPlay
              ? JSON.stringify(["CARTA", ...(play.commands || [])])
              : JSON.stringify(play.commands)
          }\n`
        )
        rl.prompt()
        rl.on("line", (idx: string) => {
          const selectedCommand = play.commands?.[Number(idx) - 1]

          if (selectedCommand) {
            play.say(selectedCommand)
            rl.close()
            return (async () => {
              resolve()
            })()
          }

          if (idx === "0" && canPlay) {
            rl.close()
            return (async () => {
              await playCard()
              resolve()
            })()
          }

          rl.close()
          return (async () => {
            await sayCommand()
            resolve()
          })()
        })
      })
    }

    const playCard = () => {
      return new Promise<void>((resolve) => {
        const rl = readline.createInterface(process.stdin, process.stdout)
        rl.setPrompt(
          `\n${play.player?.id} elije una carta [${play.player?.hand.map(
            (_c, i) => i + 1
          )}]: ${JSON.stringify(play.player?.hand)}\n`
        )
        rl.prompt()
        rl.on("line", (idx: string) => {
          const playedCard = play.use(Number(idx) - 1)
          if (!playedCard) {
            rl.close()
            return (async () => {
              await playCard()
              resolve()
            })()
          }
          const handString = JSON.stringify(play.player?.hand)
          // process.stdout.write("\u001B[7;0f")
          console.log(`\n${handString}\nUsing ${playedCard}`)
          // process.stdout.write("\u001B[10;0f")
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
    }

    await sayCommand()
  }

  // process.stdout.write("\u001B[2J\u001B[2;0f")
  match.teams.map((t, i) =>
    console.log(
      `Equipo ${i}: ${t.players.map((p) => ` ${p.id}`)} === ${t.points.malas} malas ${
        t.points.buenas
      } buenas`
    )
  )
  console.log(`\nEquipo Ganador:${match.winner?.players.map((p) => ` ${p.id}`)}`)
})()
