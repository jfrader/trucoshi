import { CARDS } from "./constants";
import { ICard, IHand, IMatch, IPlayedCard, IPlayer, IPoints, IRound, ITable, ITeam } from "./types";
import { checkHandWinner, checkMatchWinner, shuffle } from "./utils";

function Deck(): Array<ICard> {
    return shuffle<ICard>(Object.keys(CARDS) as Array<ICard>)
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
    
            const teamIdx = checkHandWinner(_hand.rounds, dealer as 0 | 1)

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

export function Player(id: string, teamIdx: number): IPlayer {
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

export function Team(color: string, players: Array<IPlayer>): ITeam {
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

export function Match(teams: Array<ITeam> = [], matchPoint: number = 9): IMatch {

    const size = teams[0].players.length

    if (size !== teams[1].players.length) {
        throw new Error("Team size mismatch")
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

            const hasWinner = checkMatchWinner(teams, matchPoint)

            if (hasWinner !== null) {
                _match.winner = hasWinner
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

export function PlayedCard({ player, card }: { player: IPlayer, card: ICard }): IPlayedCard {
    const _card = {
        player,
        card
    }

    return _card;
}
