import * as readline from "readline"
import { Trucoshi } from "../lib"
import { EHandState, IPlayInstance, IRound, ITeam } from "../lib/types"

const command = (
  title: string,
  onLine: (line: string, close: () => void) => Promise<void>
): (() => Promise<void>) => {
  const promise = () =>
    new Promise<void>((resolve) => {
      const rl = readline.createInterface(process.stdin, process.stdout)
      rl.setPrompt(title)
      rl.prompt()
      rl.on("line", async (line) => {
        try {
          await onLine(line, () => rl.close())
          rl.close()
          resolve()
        } catch (e) {
          rl.close()
          return (async () => {
            await promise()
            resolve()
          })()
        }
      })
    })

  return promise
}

;(async () => {
  Trucoshi(["lukini", "guada"], ["denoph", "juli"], 9)
    .onTurn(async (play: IPlayInstance) => {
      const name = play.player?.id.toUpperCase()
      console.log(`=== Mano ${play.handIdx} === Ronda ${play.roundIdx} === Turno de ${name} ===`)

      play.teams.map((team, id) =>
        console.log(`=== Team ${id} = ${team.points.malas} malas ${team.points.buenas} buenas`)
      )

      const canPlay = play.state === EHandState.WAITING_PLAY

      console.log(
        play.rounds && play.rounds.length
          ? play.rounds.map((round: IRound) =>
              round.cards.length ? round.cards.map((c) => [c.player.id, c.card]) : ""
            )
          : ""
      )

      const sayCommand = command(
        `${play.player?.id} elije una accion [${canPlay ? "0," : ""}${play.commands?.map(
          (_c, i) => i + 1
        )}]: ${
          canPlay
            ? JSON.stringify(["CARTA", ...(play.commands || [])])
            : JSON.stringify(play.commands)
        }\n`,
        async (idx: string, close: () => void) => {
          const selectedCommand = play.commands?.[Number(idx) - 1]

          if (selectedCommand) {
            play.say(selectedCommand)
            return Promise.resolve()
          }

          if (idx === "0" && canPlay) {
            close()
            await playCommand()
            return Promise.resolve()
          }

          return Promise.reject()
        }
      )

      const playCommand = command(
        `${play.player?.id} elije una carta [${play.player?.hand.map(
          (_c, i) => i + 1
        )}]: ${JSON.stringify(play.player?.hand)}\n`,
        async (idx: string) => {
          const playedCard = play.use(Number(idx) - 1)
          if (!playedCard) {
            return Promise.reject()
          }
          const handString = JSON.stringify(play.player?.hand)
          console.log(`\n${handString}\nUsing ${playedCard}`)
          console.log(
            play.rounds && play.rounds.length
              ? play.rounds.map((round: IRound) =>
                  round.cards.length ? round.cards.map((c) => [c.player.id, c.card]) : ""
                )
              : ""
          )
          return Promise.resolve()
        }
      )

      await sayCommand()
    })
    .onWinner(async (winner: ITeam, teams: [ITeam, ITeam]) => {
      teams.map((t, i) =>
        console.log(
          `Equipo ${i}: ${t.players.map((p) => ` ${p.id}`)} === ${t.points.malas} malas ${
            t.points.buenas
          } buenas`
        )
      )
      console.log(`\nEquipo Ganador:${winner?.players.map((p) => ` ${p.id}`)}`)
    })
    .start()
})()
