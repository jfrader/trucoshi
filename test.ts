import * as readline from 'readline'
import { COLORS } from './constants';
import { Match, PlayedCard, Player, Team } from "./trucoshi";
import { ICard, IPlayer } from './types';

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
        if (value && value.currentPlayer) {
            //  const card = value.currentPlayer.useCard(Math.round(Math.random() * 2))
            //  value.currentRound?.play({ card, player: value.currentPlayer })
            const prom = () => new Promise<void>((resolve) => {
                const rl = readline.createInterface(process.stdin, process.stdout);
                console.log(match.getCurrentHand()?.rounds.map(round => round.cards.map(c => [c.player.id, c.card])))

                rl.setPrompt(`Player ${value.currentPlayer?.id}\n\nPick a card to play [1, 2, 3]: ${JSON.stringify(value.currentPlayer?.hand)}\n`);
                rl.prompt();
                rl.on('line', (idx: string) => {
                    const index = Number(idx) - 1
                    let playedCard: ICard | null | undefined = null
                    if (index >= 0 && index < 3) {
                        playedCard = value.currentPlayer?.useCard(value.currentPlayer?.hand[index])
                    }
                    if (!playedCard) {
                        rl.close();
                        return (async () => {
                            await prom()
                            resolve()
                        })();
                    }
                    value.currentRound?.play(PlayedCard({ player: value.currentPlayer as IPlayer, card: playedCard as ICard }))
                    rl.close();
                    resolve();
                });
            });

            await prom()
        }
    }

    console.log(match.teams.map(t => [t.points, t.players[0].id]))

})();