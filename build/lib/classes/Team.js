"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Team = void 0;
function Team(id, players, name) {
    const team = {
        _players: new Map(),
        get players() {
            return Array.from(team._players.values());
        },
        id,
        name: name || (id ? "Ellos" : "Nosotros"),
        points: {
            buenas: 0,
            malas: 0,
            winner: false,
        },
        getPublicTeam(playerSession) {
            return {
                id: team.id,
                name: team.name,
                points: team.points,
                players: team.players.map((player) => player.getPublicPlayer(playerSession)),
            };
        },
        isTeamDisabled() {
            return team.players.every((player) => player.disabled || player.abandoned);
        },
        enable(player) {
            var _a;
            if (player) {
                (_a = team._players.get(player.session)) === null || _a === void 0 ? void 0 : _a.enable();
                return team.isTeamDisabled();
            }
            for (const player of team.players) {
                player.enable();
            }
            return team.isTeamDisabled();
        },
        disable(player) {
            var _a;
            (_a = team._players.get(player.session)) === null || _a === void 0 ? void 0 : _a.disable();
            return team.isTeamDisabled();
        },
        pointsToWin(matchPoint) {
            if (team.points.malas < matchPoint && team.points.buenas < 1) {
                return matchPoint * 2 - team.points.malas;
            }
            return matchPoint - team.points.buenas;
        },
        addPoints(matchPoint, points, simulate = false) {
            const current = structuredClone(team.points);
            const malas = current.malas + points;
            const diff = malas - matchPoint;
            if (diff > 0) {
                current.malas = matchPoint;
                current.buenas += diff;
                if (current.buenas >= matchPoint) {
                    current.winner = true;
                }
            }
            else {
                current.malas = malas;
            }
            if (simulate) {
                return current;
            }
            team.points = current;
            return team.points;
        },
    };
    players.forEach((player) => team._players.set(player.session, player));
    return team;
}
exports.Team = Team;
