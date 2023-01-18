import * as readline from 'readline'
import { COLORS } from './constants';
import { Match, PlayedCard, Player, Team } from "./trucoshi";
import { ICard, IPlayer, IRound } from './types';

(async () => {
    const player1 = Player('lukini', 0)
    const player2 = Player('guada', 0)
    const player3 = Player('denoph', 1)
    const player4 = Player('juli', 1)

    const team1 = Team(COLORS[0], [player1, player2])
    const team2 = Team(COLORS[1], [player3, player4])

    const match = Match([team1, team2], 9);

    while(!match.winner) {
        const { value } = match.getNextTurn()
        if (value && value.currentHand && value.currentHand.currentPlayer) {

            const currentHand: any = value.currentHand;
            const name = value.currentHand?.currentPlayer?.id.toUpperCase()
            console.log(`=== Mano ${currentHand.idx + 1} === Ronda ${currentHand.rounds.length} === Turno de ${name} ===\n`)
            match.teams.map((team, id) => console.log(`=== Team ${id} = ${team.points} Puntos ===\n`))
            console.log(currentHand && currentHand.rounds.length ? (currentHand.rounds.map((round: IRound) => round.cards.length ? round.cards.map(c => [c.player.id, c.card]) : '')) : '')

            const card = value.currentHand.currentPlayer.hand[Math.round(Math.random() * (value.currentHand.currentPlayer.hand.length - 1))]
            console.log(`\n${JSON.stringify(value.currentHand?.currentPlayer?.hand)}\nUsing ${card}`)

            const playedCard = value.currentHand.currentPlayer.useCard(card)
            value.currentHand.currentRound?.play({ card: playedCard as ICard, player:  value.currentHand.currentPlayer })
            console.log(currentHand && currentHand.rounds.length ? (currentHand.rounds.map((round: IRound) => round.cards.length ? round.cards.map(c => [c.player.id, c.card]) : '')) : '')
        }

    }

    console.log(match.teams.map(t => [t.points, t.players[0].id]))

})();