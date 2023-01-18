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


function Round(): IRound {
    const _round: IRound = {
        highest: -1,
        winner: null,
        cards: [],
        tie: false,
        play({ card, player }: IPlayedCard) {
            if (_round.highest > -1 && CARDS[card] === _round.highest) {
                _round.tie = true
            }
            if (CARDS[card] > _round.highest) {
                _round.tie = false
                _round.highest = CARDS[card]
                _round.winner = player
            }
            _round.cards.push({ card, player })
            return _round;
        }
    }

    return _round
}

export function Match(teams: Array<ITeam> = [], matchPoint: number = 9): IMatch {

    const size = teams[0].players.length

    if (size !== teams[1].players.length) {
        throw new Error("Team size mismatch")
    }

    function* handsGeneratorSequence() {
        let handIdx = 0;
        while (!_match.winner) {
            const deck = Deck()
            const hand = _match.setCurrentHand(Hand(_match, deck, handIdx)) as IHand
            while(!hand.winner) {
                const { value } = hand.getNextPlayer()
                if (value && value.winner) {
                    _match.addPoints(value.points)
                    _match.setCurrentHand(null)
                    break;
                }
                _match.setCurrentHand(value as IHand)
                yield _match
            }

            const hasWinner = checkMatchWinner(teams, matchPoint)

            if (hasWinner !== null) {
                _match.setWinner(hasWinner)
                _match.setCurrentHand(null)
            }
            handIdx++;
            _match.incrementTableTurn()
        }
        yield _match
    }

    const handsGenerator = handsGeneratorSequence()

    const _match: IMatch = {
        winner: null,
        teams: teams as [ITeam, ITeam],
        hands: [],
        table: Table(teams, size),
        turn: 0,
        currentHand: null,
        addPoints(points: IPoints) {
            _match.teams[0].addPoints(points[0])
            _match.teams[1].addPoints(points[1])
        },
        pushHand(hand: IHand) {
            _match.hands.push(hand)
        },
        setCurrentHand(hand: IHand) {
            _match.currentHand = hand
            return _match.currentHand
        },
        setWinner(winner: ITeam) {
            _match.winner = winner
        },
        incrementTableTurn() {
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

    return _match;
}

function Hand(match: IMatch, deck: Array<ICard>, idx: number): IHand {

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

            _hand.currentRound = Round()
            _hand.rounds.push(_hand.currentRound);

            let previousRound = _hand.rounds[currentRoundIdx - 1]
            if (previousRound && previousRound.winner && !previousRound.tie) {
                const newTurn = match.table.findIndex(player => player.id === previousRound?.winner?.id)
                if (newTurn !== -1) {
                    _hand.turn = newTurn
                }
            }

            while (i < match.table.length) {
                _hand.currentPlayer = match.table[_hand.turn];
                
                
                if (_hand.turn >= match.table.length - 1) {
                    _hand.turn = 0
                } else {
                    _hand.turn++
                }
                
                i++
    
                yield _hand;
            }
    
            const teamIdx = checkHandWinner(_hand.rounds, dealer as 0 | 1)

            if (teamIdx !== null) {
                _hand.points[teamIdx] += truco
                _hand.winner = true
            }
            currentRoundIdx++;
        }
        yield _hand
    }

    const roundsGenerator = roundsGeneratorSequence()

    const _hand: IHand = {
        idx,
        turn: match.turn,
        rounds: [],
        winner: false,
        points: {
            0: 0,
            1: 0,
            2: 0 // ties
        },
        currentRound: null,
        currentPlayer: null,
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
        _players: new Map<string, IPlayer>(),
        get players() {
            return Array.from(_team._players.values())
        },
        color,
        points: 0,
        addPoints(points: number) {
            _team.points += points
            return _team.points
        },
    }

    players.forEach(player => _team._players.set(player.id, player))

    return _team;
}

export function PlayedCard({ player, card }: { player: IPlayer, card: ICard }): IPlayedCard {
    const _card = {
        player,
        card
    }

    return _card;
}
