import { CARDS } from "./constants";
import { EHandPlayCommand, ICard, IDeck, IHand, IHandInstance, IMatch, IPlayedCard, IPlayer, IPoints, IRound, ITable, ITeam } from "./types";
import { checkHandWinner, checkMatchWinner, getCardValue, shuffleArray } from "./utils";

function Deck(): IDeck {
    const _deck: IDeck = {
        cards: Object.keys(CARDS) as Array<ICard>,
        usedCards: [],
        takeCard() {
            const card = _deck.cards.shift() as ICard
            _deck.usedCards.push(card)
            return card
        },
        shuffle() {
            _deck.cards = _deck.cards.concat(_deck.usedCards)
            _deck.usedCards = []
            _deck.cards = shuffleArray(_deck.cards)
            if (_deck.cards.length !== 40) {
                throw new Error("This is not good")
            }
            return _deck.cards
        }
    }
    return _deck
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
            const value = getCardValue(card)
            if (_round.highest > -1 && value === _round.highest) {
                _round.tie = true
            }
            if (CARDS[card] > _round.highest) {
                _round.tie = false
                _round.highest = value
                _round.winner = player
            }
            _round.cards.push({ card, player })
            return _round;
        }
    }

    return _round
}

export function Match(teams: Array<ITeam> = [], matchPoint: number = 9): IMatch {

    const deck = Deck()

    const size = teams[0].players.length

    if (size !== teams[1].players.length) {
        throw new Error("Team size mismatch")
    }

    function* handsGeneratorSequence() {
        let handIdx = 0;
        while (!_match.winner) {
            deck.shuffle()
            const hand = _match.setCurrentHand(Hand(_match, deck, handIdx)) as IHand
            while(!hand.finished) {
                const { value } = hand.getNextPlayer()
                if (value && value.finished) {
                    continue;
                }
                _match.setCurrentHand(value as IHand)
                yield _match
            }
            
            _match.addPoints(hand.points)
            _match.setCurrentHand(null)

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
        play() {
            return _match.currentHand?.play()
        },
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

function HandInstance(hand: IHand) {

    const _instance: IHandInstance = {
        player: hand.currentPlayer,
        commands: [],
        rounds: hand.rounds,
        use(idx: number) {
            const player = hand.currentPlayer
            const round = hand.currentRound
            if (!player || !round) {
                return null
            }
            const card = player.hand[idx]
            if (card) {
                return round.play({ player, card })
            }
            return null
        },
        say(command: EHandPlayCommand) {
            if (!hand.currentPlayer) {
                return null
            }
            return hand
        }
    }

    return _instance
}

function Hand(match: IMatch, deck: IDeck, idx: number) {

    const truco = 1;

    match.teams.forEach((team) => {
        team.players.forEach(player => {
            const playerHand = [deck.takeCard(), deck.takeCard(), deck.takeCard()]
            player.setHand(playerHand)
            // player.setHand(["5c", "4c", "6c"])
        })
    })

    function* roundsGeneratorSequence() {
        let currentRoundIdx = 0;
        let forehandTeamIdx = match.table[_hand.turn].teamIdx as 0 | 1

        while (currentRoundIdx < 3 && !_hand.finished) {

            let i = 0

            const round = Round()
            _hand.setCurrentRound(round)
            _hand.pushRound(round)

            let previousRound = _hand.rounds[currentRoundIdx - 1]

            // Put previous round winner as forehand
            if (previousRound && previousRound.winner && !previousRound.tie) {
                const newTurn = match.table.findIndex(player => player.id === previousRound?.winner?.id)
                if (newTurn !== -1) {
                    _hand.setTurn(newTurn)
                }
            }

            while (i < match.table.length) {
                _hand.setCurrentPlayer(match.table[_hand.turn])
                
                if (_hand.turn >= match.table.length - 1) {
                    _hand.setTurn(0)
                } else {
                    _hand.setTurn(_hand.turn + 1)
                }
                
                i++
    
                yield _hand;
            }
    
            const teamIdx = checkHandWinner(_hand.rounds, forehandTeamIdx)

            if (teamIdx !== null) {
                _hand.addPoints(teamIdx, truco)
                _hand.setFinished(true)
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
        finished: false,
        points: {
            0: 0,
            1: 0
        },
        currentRound: null,
        currentPlayer: null,
        play() {
            return HandInstance(_hand)
        },
        pushRound(round: IRound) {
            _hand.rounds.push(round)
            return round
        },
        setTurn(turn: number) {
            _hand.turn = turn
            return match.table[_hand.turn]
        },
        addPoints(team: 0 | 1, points: number) {
            _hand.points[team] = _hand.points[team] + points
        },
        setCurrentRound(round: IRound | null) {
            _hand.currentRound = round
            return _hand.currentRound
        },
        setCurrentPlayer(player: IPlayer | null) {
            _hand.currentPlayer = player
            return _hand.currentPlayer
        },
        setFinished(finshed: boolean) {
            _hand.finished = finshed
            return _hand.finished
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
