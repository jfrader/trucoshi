import * as readline from "readline"
import { Lobby } from "../lib"
import { ICard, IPlayInstance, IRound, ITeam } from "../lib/types"

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

const playCommand = (play: IPlayInstance) =>
  command(
    `${play.player?.id} elije una carta [${play.player?.hand.map(
      (_c, i) => i + 1
    )}]: ${JSON.stringify(play.player?.hand)}\n`,
    async (idx) => {
      const card = play.player?.hand[Number(idx) - 1]
      const playedCard = play.use(Number(idx) - 1, card as ICard)
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

const sayCommand = (play: IPlayInstance, canPlay: boolean) =>
  command(
    `${play.player?.id} elije una accion [${canPlay ? "0," : ""}${play.commands?.map(
      (_c, i) => i + 1
    )}]: ${
      canPlay ? JSON.stringify(["CARTA", ...(play.commands || [])]) : JSON.stringify(play.commands)
    }\n`,
    async (idx, close) => {
      const selectedCommand = play.commands?.[Number(idx) - 1]

      if (selectedCommand) {
        play.say(selectedCommand)
        return Promise.resolve()
      }

      if (idx === "0" && canPlay) {
        close()
        await playCommand(play)()
        return Promise.resolve()
      }

      return Promise.reject()
    }
  )

;(async () => {
  const trucoshi = Lobby()

  trucoshi.addPlayer("lukini", "lukini").setReady(true)
  trucoshi.addPlayer("denoph", "denoph").setReady(true)
  trucoshi.addPlayer("guada", "guada").setReady(true)
  trucoshi.addPlayer("juli", "juli").setReady(true)

  trucoshi
    .startMatch()
    .onTruco(async (play) => {
      await sayCommand(play, false)()
    })
    .onTurn(async (play) => {
      const name = play.player?.id.toUpperCase()
      console.log(`=== Mano ${play.handIdx} === Ronda ${play.roundIdx} === Turno de ${name} ===`)

      play.teams.map((team, id) =>
        console.log(`=== Team ${id} = ${team.points.malas} malas ${team.points.buenas} buenas`)
      )

      console.log(
        play.rounds && play.rounds.length
          ? play.rounds.map((round: IRound) =>
              round.cards.length ? round.cards.map((c) => [c.player.id, c.card]) : ""
            )
          : ""
      )

      await sayCommand(play, true)()
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
    .begin()
})()
