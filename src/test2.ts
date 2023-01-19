import * as readline from 'readline'
import { COLORS } from './constants';
import { Match, Player, Team } from "./trucoshi";

(async () => {
    const player1 = Player('lukini', 0)
    const player2 = Player('guada', 0)
    const player3 = Player('denoph', 1)
    const player4 = Player('juli', 1)

    const team1 = Team(COLORS[0], [player1, player2])
    const team2 = Team(COLORS[1], [player3, player4])

    const match = Match([team1, team2], 9);

    while(!match.winner) {

        match.getNextTurn()

        const play = match.play()

        if (!play || !play.player) {
            break;
        }

        console.log('Va a jugar', play.player?.id, play.player?.hand)

        const prom = () => new Promise<void>((resolve) => {
            const rl = readline.createInterface(process.stdin, process.stdout);
            process.stdout.write('\u001B[2J\u001B[0;0f');
            console.log(play.rounds?.map(round => round.cards.map(c => [c.player.id, c.card])))
            rl.setPrompt(`\n${play.player?.id} elije una carta [1, 2, 3]: ${JSON.stringify(play.player?.hand)}\n`);
            rl.prompt();
            rl.on('line', (idx: string) => {
                const playedCard = play.use(Number(idx) - 1)
                if (!playedCard) {
                    rl.close();
                    return (async () => {
                        await prom()
                        resolve()
                    })();
                }
                // console.log(playedCard.cards.map(c => [c.player.id, c.card]))
                console.log(play.rounds?.map(round => round.cards.map(c => [c.player.id, c.card])))
                rl.close();
                resolve()
            });
        });

        await prom()

    }

    console.log(match.teams.map(t => [t.points, t.players[0].id]))

})();