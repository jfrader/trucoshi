import { IPoints, IRound, ITeam } from "./types";

export function shuffle<T = never>(array: Array<T>) {
    let currentIndex = array.length, randomIndex;

    while (currentIndex != 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }

    return array as Array<T>;
}

export function checkHandWinner(rounds: Array<IRound>, dealerTeamIdx: 0 | 1): null | 0 | 1 {
    const roundsWon: IPoints = {
        0: 0,
        1: 0
    }

    for (let i = 0; i < rounds.length; i++) {
        const round = rounds[i];
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

export function checkMatchWinner(teams: Array<ITeam>, matchPoint: number): ITeam | null {
    if (teams[0].points >= matchPoint) {
        return teams[0]
    }
    if (teams[1].points >= matchPoint) {
        return teams[1]
    }
    return null
}
