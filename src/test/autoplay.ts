import { COLORS } from '../lib/constants';
import { Match, Player, Team } from "../lib/trucoshi";
import { ICard, IRound } from '../lib/types';

(async () => {
    const player1 = Player('lukini', 0)
    const player2 = Player('guada', 0)
    const player3 = Player('denoph', 1)
    const player4 = Player('juli', 1)
    const player5 = Player('fran', 1)
    const player6 = Player('day', 0)

    const team1 = Team(COLORS[0], [player1, player2, player6])
    const team2 = Team(COLORS[1], [player3, player4, player5])

    const match = Match([team1, team2], 9);

    while(!match.winner) {
        const play = match.play()

        if (!play || !play.player) {
            break;
        }

        const name = play.player.id.toUpperCase()
        console.log(`=== Mano ${play.handIdx} === Ronda ${play.roundIdx} === Turno de ${name} ===`)
        match.teams.map((team, id) => console.log(`=== Team ${id} = ${team.points} Puntos ===`))
        console.log(play.rounds && play.rounds.length ? (play.rounds.map((round: IRound) => round.cards.length ? round.cards.map(c => [c.player.id, c.card]) : '')) : '')

        const randomIdx = Math.round(Math.random() * (play.player.hand.length - 1))
        const card = play.use(randomIdx)

        console.log(`\n${JSON.stringify(play.player.hand)}\nUsing ${card}`)
        console.log(play.rounds && play.rounds.length ? (play.rounds.map((round: IRound) => round.cards.length ? round.cards.map(c => [c.player.id, c.card]) : '')) : '')
    }

    console.log('\n')
    match.teams.map((t, i) => console.log(`Equipo ${i}: ${t.players.map(p => ` ${p.id}`)} === ${t.points} puntos`))
    console.log(`\nEquipo Ganador:${match.winner?.players.map(p => ` ${p.id}`)}`)

})();