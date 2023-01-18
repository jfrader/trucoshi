import * as readline from 'readline'

const CARDS = {
    '1e': 14, '1b': 13, '7e': 12, '7o': 11,
    '3e': 10, '3o': 10, '3b': 10, '3c': 10,
    '2e': 9, '2o': 9, '2b': 8, '2c': 8,
    '1o': 7, '1c': 7, 're': 6, 'ro': 6,
    'rb': 6, 'rc': 6, 'ce': 5, 'co': 5,
    'cb': 5, 'cc': 5, 'pe': 4, 'po': 4,
    'pb': 4, 'pc': 4, '7b': 3, '7c': 3,
    '6e': 2, '6o': 2, '6b': 2, '6c': 2,
    '5e': 1, '5o': 1, '5b': 1, '5c': 1,
    '4e': 0, '4o': 0, '4b': 0, '4c': 0
}

const COLORS = ["#9b111", "#17c6c6", "#8c1d1d", "#9f9b9b", "#a5a5a5", "#f5a623", "#f44336", "#c2185b"];

type ICard = keyof typeof CARDS

interface IPlayedCard {
    player: IPlayer
    card: ICard
}

interface IPlayer {
    teamIdx: number
    id: string
    hand: Array<ICard>,
    usedHand: Array<ICard>
    setHand(hand: Array<ICard>): Array<ICard>
    useCard(card: string): ICard | null
}

interface ITeam {
    color: string
    _players: Map<string, IPlayer>
    players: Array<IPlayer>
    points: number
}

type IMatchPlayResult = { currentPlayer?: IPlayer, currentRound?: IRound, winner?: ITeam }

interface IMatch {
    teams: [ITeam, ITeam]
    hands: Array<IHand>
    winner: ITeam | null
    currentPlayer: IPlayer | null
    table: ITable
    turn: number
    getCurrentHand(): IHand | null
    incrementTableTurn(): IMatch
    getNextTurn(): IteratorResult<IMatchPlayResult, IMatchPlayResult | void>
}

type IPoints = { 0: number, 1: number }

type IGetNextPlayerResult = { currentPlayer?: IPlayer, currentRound?: IRound, points?: IPoints }

interface IHand {
    turn: number
    winner: boolean
    points: IPoints
    rounds: Array<IRound>
    currentPlayer: IPlayer | null
    currentRound: IRound | null
    getCurrentRound(): IRound | null
    getNextPlayer(): IteratorResult<IGetNextPlayerResult, IGetNextPlayerResult | void>
}

type ITable = Array<IPlayer>

interface IRound {
    tie: boolean,
    winner: IPlayer | null
    highest: number
    cards: Array<IPlayedCard>
    play(playedCard: IPlayedCard): IRound
}

function shuffle(array: Array<ICard>) {
    let currentIndex = array.length, randomIndex;

    while (currentIndex != 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }

    return array;
}

function Deck(): Array<ICard> {
    return shuffle(Object.keys(CARDS) as Array<ICard>)
}

function Player(id: string, teamIdx: number): IPlayer {
    const _player: IPlayer = {
        id,
        teamIdx,
        hand: [],
        usedHand: [],
        setHand(hand: Array<ICard>) {
            _player.hand = hand
            _player.usedHand = []
            return hand
        },
        useCard(card: string) {
            const search = _player.hand.findIndex(c => c === card)
            if (search !== -1) {
                const card = _player.hand.splice(search, 1)[0]
                _player.usedHand.push(card)
                return card;
            }
            return null
        }
    }

    return _player;
}

function Team(color: string, players: Array<IPlayer>): ITeam {
    const _team = {
        color,
        _players: new Map<string, IPlayer>(),
        get players() {
            return Array.from(_team._players.values())
        },
        points: 0,
    }

    players.forEach(player => _team._players.set(player.id, player))

    return _team;
}

function Table(teams: Array<ITeam>, size: number): ITable {
    const table: ITable = []

    if (teams[0].players.length != size || teams[1].players.length != size) {
        throw new Error("Unexpected team size")
    }

    for (let i = 0; i < size; i++) {
        table.push(teams[0].players[i])
        table.push(teams[1].players[i])
    }

    return table;
}

function Match(teams: Array<ITeam> = [], matchPoint: number = 9): IMatch {

    const size = teams[0].players.length

    if (size !== teams[1].players.length) {
        throw new Error("Team size mismatch")
    }

    function checkMatchWinner() {
        if (teams[0].points >= matchPoint) {
            return teams[0]
        }
        if (teams[1].points >= matchPoint) {
            return teams[1]
        }
        return null
    }

    function* handsGeneratorSequence() {
        let handIdx = 0;
        while (!_match.winner) {
            const hand = Hand(_match, handIdx);
            _match.hands.push(hand);
            while(!hand.winner) {
                const { value } = hand.getNextPlayer()
                if (value && value.points) {
                    break;
                }
                const { currentPlayer, currentRound } = value || {}
                yield { currentPlayer, currentRound }
            }
            teams[0].points += hand.points[0]
            teams[1].points += hand.points[1]

            const hasWinner = checkMatchWinner()

            if (hasWinner !== null) {
                _match.winner = checkMatchWinner()
            }
            handIdx++;
            _match.incrementTableTurn()
        }
        yield { winner: _match.winner }
    }

    const handsGenerator = handsGeneratorSequence()

    const _match: IMatch = {
        winner: null,
        teams: teams as [ITeam, ITeam],
        hands: [],
        table: Table(teams, size),
        turn: 0,
        currentPlayer: null,
        getCurrentHand() {
            return _match.hands.at(_match.hands.length - 1) || null
        },
        incrementTableTurn() {
            _match.currentPlayer = _match.table[_match.turn]
            if (_match.turn >= (size * 2) - 1) {
                _match.turn = 0
            } else {
                _match.turn++;
            }
            return _match
        },
        getNextTurn() {
            return handsGenerator.next()
        }
    }

    _match.currentPlayer = _match.table[_match.turn]

    return _match;
}

function PlayedCard({ player, card }: { player: IPlayer, card: ICard }): IPlayedCard {
    const _card = {
        player,
        card
    }

    return _card;
}

function Round(canTie: boolean): IRound {
    const _round: IRound = {
        highest: -1,
        winner: null,
        cards: [],
        tie: false,
        play({ card, player }: IPlayedCard) {
            if (canTie && _round.highest > -1 && CARDS[card] === _round.highest) {
                _round.tie = true
            }
            if (CARDS[card] > _round.highest) {
                _round.highest = CARDS[card]
                _round.winner = player
            }
            _round.cards.push({ card, player })
            return _round;
        }
    }

    return _round
}

function Hand(match: IMatch, idx: number): IHand {
    const deck = Deck();

    const truco = 1;

    match.teams.forEach((team) => {
        team.players.forEach(player => {
            player.setHand([deck.shift() as ICard, deck.shift() as ICard, deck.shift() as ICard])
            // player.setHand(["5c", "4c", "6c"])
        })
    })

    function checkTrucoWinner(dealerTeamIdx: 0 | 1): null | 0 | 1 {

        const roundsWon: IPoints = {
            0: 0,
            1: 0
        }

        for (let i = 0; i < _hand.rounds.length; i++) {
            const round = _hand.rounds[i];
            if (round.tie) {
                roundsWon[0] += 1;
                roundsWon[1] += 1;
                continue;
            }
            if (round.winner?.teamIdx === 0) {
                roundsWon[0] += 1;
            }
            if (round.winner?.teamIdx === 1) {
                roundsWon[1] += 1;
            }
        }
        
        if (roundsWon[0] > 2 && roundsWon[1] > 2) {
            return dealerTeamIdx
        }

        if (roundsWon[0] >= 2 && roundsWon[1] < 2) {
            return 0
        }

        if (roundsWon[1] >= 2 && roundsWon[0] < 2) {
            return 1
        }

        return null
    }

    function* roundsGeneratorSequence() {
        let currentRoundIdx = 0;
        let dealer = match.table[_hand.turn].teamIdx

        while (currentRoundIdx < 3 && !_hand.winner) {

            let i = 0

            const previousRound = _hand.rounds[i]

            _hand.currentRound = Round(currentRoundIdx === 0 || (previousRound && previousRound.tie))
            _hand.rounds.push(_hand.currentRound);

            while (i < match.table.length) {
                _hand.currentPlayer = match.table[_hand.turn];
                
                if (_hand.turn >= match.table.length - 1) {
                    _hand.turn = 0
                } else {
                    _hand.turn++
                }
                i++
    
                yield { currentRound: _hand.currentRound, currentPlayer: _hand.currentPlayer };
            }
    
            const teamIdx = checkTrucoWinner(dealer as 0 | 1)

            if (teamIdx !== null) {
                console.log(match.teams[teamIdx].players[0].id, " gano la mano ", _hand.rounds.map(round => round.cards.map(c => [c.player.id, c.card])))
                _hand.points[teamIdx] += truco
                _hand.winner = true
            }
            currentRoundIdx++;
        }
        yield { points: _hand.points }
    }

    const roundsGenerator = roundsGeneratorSequence()

    const _hand: IHand = {
        turn: match.turn,
        rounds: [],
        winner: false,
        points: {
            0: 0,
            1: 0
        },
        currentRound: null,
        currentPlayer: null,
        getCurrentRound() {
            return _hand.rounds.at(_hand.rounds.length - 1) || null
        },
        getNextPlayer() {
            return roundsGenerator.next();
        },
    }

    return _hand
}

(async () => {
    const player1 = Player('lukini', 0)
    const player2 = Player('denoph', 1)

    const team1 = Team(COLORS[0], [player1])
    const team2 = Team(COLORS[1], [player2])

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

