import * as readline from "readline"
import { IPlayInstance, IRound, Lobby } from "../../../src/truco"
import { ICard, IPlayer, ITeam } from "../../../src/types"
import { CARDS_HUMAN_READABLE } from "../../lib/constants"

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
    `${play.player?.name} elije una carta [${play.player?.hand.map(
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
              round.cards.length ? round.cards.map((c) => [c.player.name, c.card]) : ""
            )
          : ""
      )
      return Promise.resolve()
    }
  )

const sayCommand = (play: IPlayInstance, canPlay: boolean) => {
  if (!play.player?._commands) {
    return () => Promise.resolve()
  }
  const commandsArr = Array.from(play.player._commands.values())
  return command(
    `${play.state} ${play.player?.name} elije una accion [${canPlay ? "0," : ""}${commandsArr.map(
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

const sayPoints = (play: IPlayInstance, isFlor: boolean = false) =>
  command(
    `Canta los puntos ${play.player?.name}, puede cantar: ${
      isFlor ? play.player?.flor?.value || [] : play.player?.envido.map((e) => e.value + ", ") || []
    }`,
    async (line, close) => {
      const points = isFlor
        ? [play.player?.flor?.value || 0]
        : play.player?.envido.map((e) => e.value) || []
      if (line && points.includes(Number(line))) {
        close()
        if (play.player && play.say(Number(line), play.player)) {
          return Promise.resolve()
        }
      }
      return Promise.reject()
    }
  )

const sayFlor = (play: IPlayInstance) => sayPoints(play, true)

;(async () => {
  const trucoshi = Lobby("testmatch2", "lucas")

  // Enable flor in the match options
  trucoshi.setOptions({ flor: true })

  const promises = ["lucas", "guada", "juli", "day", "gaspar", "fran"].map((n, i) =>
    trucoshi.addPlayer({ key: n, name: n, session: n }).then((player) => {
      player.setReady(true)
      player.setIdx(i)
    })
  )

  await Promise.allSettled(promises)

  trucoshi
    .startMatch()
    .onEnvido(async (play, isPointsRound) => {
      if (isPointsRound) {
        return sayPoints(play)()
      }
      await sayCommand(play, false)()
    })
    .onFlor(async (play) => {
      await sayCommand(play, false)()
    })
    .onTruco(async (play) => {
      await sayCommand(play, false)()
    })
    .onTurn(async (play) => {
      const name = play.player?.name.toUpperCase()
      console.log(`=== Mano ${play.handIdx} === Ronda ${play.roundIdx} === Turno de ${name} ===`)

      play.teams.map((team, id) =>
        console.log(`=== Team ${id} = ${team.points.malas} malas ${team.points.buenas} buenas`)
      )

      console.log(
        play.rounds && play.rounds.length
          ? play.rounds.map((round: IRound) =>
              round.cards.length
                ? round.cards.map((c) => [c.player.name, CARDS_HUMAN_READABLE[c.card] || "xx"])
                : ""
            )
          : ""
      )

      // Display flor availability if the player has flor
      if (play.player?.hasFlor) {
        console.log(`${play.player.name} tiene flor: ${play.player.flor?.value}`)
      }

      await sayCommand(play, true)()
    })
    .onWinner(async (winner: ITeam) => {
      console.log(`\nEquipo Ganador:${winner?.players.map((p) => ` ${p.name}`)}`)
    })
    .begin()
})()
