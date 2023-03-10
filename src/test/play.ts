import * as readline from "readline"
import { ICard, IPlayer, IPlayInstance, IRound, ITeam, Lobby } from "../lib"
import { ESayCommand } from "../types"

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

const sayCommand = (play: IPlayInstance, canPlay: boolean) => {
  if (!play.player?._commands) {
    return () => {}
  }
  const commandsArr = Array.from(play.player?._commands?.values())
  return command(
    `${play.player?.id} elije una accion [${canPlay ? "0," : ""}${commandsArr.map(
      (_c, i) => i + 1
    )}]: ${
      canPlay ? JSON.stringify(["CARTA", ...(commandsArr || [])]) : JSON.stringify(commandsArr)
    }\n`,
    async (idx, close) => {
      const selectedCommand = commandsArr[Number(idx) - 1]

      if (selectedCommand) {
        close()
        const saidCommand = play.say(selectedCommand, play.player as IPlayer)
        console.log({ saidCommand })
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
}

;(async () => {
  const trucoshi = Lobby()

  trucoshi.addPlayer("lukini", "lukini", "lukini").setReady(true)
  trucoshi.addPlayer("denoph", "denoph", "denoph").setReady(true)
  trucoshi.addPlayer("guada", "guada", "guada").setReady(true)
  trucoshi.addPlayer("juli", "juli", "juli").setReady(true)

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
