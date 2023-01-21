import * as readline from "readline"
import { Trucoshi } from "../lib"
import { EHandState, ICard, IPlayer, IRound } from "../lib/types"
;(async () => {
  const match = Trucoshi(["lukini", "guada"], ["denoph", "juli"], 9)

  while (!match.winner) {
    if (match.currentHand?.state === EHandState.FINISHED) {
      console.log(
        match.currentHand && match.currentHand.rounds.length
          ? match.currentHand.rounds.map((round: IRound) =>
              round.cards.length ? round.cards.map((c) => [c.player.id, c.card]) : ""
            )
          : ""
      )
    }
    const { value } = match.getNextTurn()
    if (value && value.currentHand && value.currentHand.currentPlayer) {
      //  const card = value.currentPlayer.useCard(Math.round(Math.random() * 2))
      //  value.currentRound?.play({ card, player: value.currentPlayer })
      const prom = () =>
        new Promise<void>((resolve) => {
          // process.stdout.write('\u001B[2J\u001B[0;0f');
          const rl = readline.createInterface(process.stdin, process.stdout)

          const currentHand: any = value.currentHand
          const name = value.currentHand?.currentPlayer?.id.toUpperCase()

          console.log(
            `=== Mano ${currentHand.idx + 1} === Ronda ${
              currentHand.rounds.length
            } === Turno de ${name} ===\n`
          )

          match.teams.map((team, id) =>
            console.log(
              `=== Team ${id} = ${team.points.malas} malas ${team.points.buenas} buenas ===\n`
            )
          )

          console.log(
            currentHand && currentHand.rounds.length
              ? currentHand.rounds.map((round: IRound) =>
                  round.cards.length ? round.cards.map((c) => [c.player.id, c.card]) : ""
                )
              : ""
          )

          rl.setPrompt(
            `\n${name} elije una carta [1, 2, 3]: ${JSON.stringify(
              value.currentHand?.currentPlayer?.hand
            )}\n`
          )
          rl.prompt()
          rl.on("line", (idx: string) => {
            const index = Number(idx) - 1
            let playedCard: ICard | null | undefined = null
            if (index >= 0 && index < 3) {
              playedCard = value.currentHand?.currentPlayer?.useCard(index)
            }
            if (!playedCard) {
              rl.close()
              return (async () => {
                await prom()
                resolve()
              })()
            }
            value.currentHand?.currentRound?.use({
              player: value.currentHand?.currentPlayer as IPlayer,
              card: playedCard as ICard,
            })
            console.log(
              currentHand && currentHand.rounds.length
                ? currentHand.rounds.map((round: IRound) =>
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
  }

  console.log(
    match.teams.map((t) => [`${t.points.malas} malas ${t.points.buenas} buenas`, t.players[0].id])
  )
})()
