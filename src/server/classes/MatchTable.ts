import { IHand, IHandPoints, ILobby, IPlayedCard, IPlayer, Lobby } from "../../lib"
import { EMatchTableState, IMatchPreviousHand, IPublicMatch, IPublicMatchInfo } from "../../types"

export interface IMatchTable {
  ownerSession: string
  matchSessionId: string
  lobby: ILobby
  state(): EMatchTableState
  isSessionPlaying(session: string): IPlayer | null
  getPreviousHand(hand: IHand): IMatchPreviousHand
  getHandRounds(hand: IHand): IPlayedCard[][]
  getPublicMatch(session?: string, isNewHand?: boolean): IPublicMatch
  getPublicMatchInfo(): IPublicMatchInfo
  waitPlayerReconnection(
    player: IPlayer,
    callback: (onReconnect: () => void, onAbandon: () => void) => void,
    update: () => void
  ): Promise<void>
}

export function MatchTable(matchSessionId: string, ownerSession: string, teamSize?: 1 | 2 | 3) {
  const matchTable: IMatchTable = {
    ownerSession,
    matchSessionId,
    lobby: Lobby(teamSize),
    state() {
      matchTable.lobby.calculateReady()
      if (matchTable.lobby.gameLoop?.winner) {
        return EMatchTableState.FINISHED
      }
      if (matchTable.lobby.started) {
        return EMatchTableState.STARTED
      }
      if (matchTable.lobby.ready) {
        return EMatchTableState.READY
      }
      return EMatchTableState.UNREADY
    },
    isSessionPlaying(session) {
      const {
        lobby: { players },
      } = matchTable
      return players.find((player) => player && player.session === session) || null
    },
    getPublicMatchInfo() {
      const {
        matchSessionId,
        state,
        lobby: { players, maxPlayers },
      } = matchTable
      return {
        ownerId: players.find((player) => player.isOwner)?.id as string,
        matchSessionId,
        maxPlayers,
        players: players.length,
        state: state(),
      }
    },
    async waitPlayerReconnection(player, callback, update) {
      player.setReady(false)

      update()

      try {
        await new Promise<void>(callback)
        player.setReady(true)
      } catch (e) {
        if (
          matchTable.state() !== EMatchTableState.STARTED &&
          matchTable.state() !== EMatchTableState.FINISHED
        ) {
          player.setReady(false)
          matchTable.lobby.removePlayer(player.session as string)
        } else {
          player.setReady(true)
        }
      }

      update()
    },
    getHandRounds(hand) {
      if (!hand) {
        return []
      }
      return hand.rounds.map((round) => round.cards) || []
    },
    getPreviousHand(hand) {
      return {
        rounds: matchTable.getHandRounds(hand),
        points: hand.points,
        matchSessionId: matchTable.matchSessionId,
      }
    },
    getPublicMatch(userSession, isNewHand = false) {
      const { lobby } = matchTable

      const winner = lobby.gameLoop?.winner || null

      const rounds = lobby.gameLoop?.currentHand
        ? matchTable.getHandRounds(lobby.gameLoop?.currentHand)
        : []

      const players = lobby.players.filter((player) => Boolean(player)) as IPlayer[]

      const currentPlayerIdx = players.findIndex(
        (player) => player && player.session === userSession
      )

      const me = currentPlayerIdx !== -1 ? players[currentPlayerIdx] : null

      const publicPlayers = (
        lobby.table ? lobby.table.getPlayersForehandFirst(me ? currentPlayerIdx : 0) : players
      ).map((player) => (player?.session === userSession ? player : player.getPublicPlayer()))

      const teams = lobby.gameLoop?.teams || lobby.teams
      const publicTeams = teams.map((team) => team.getPublicTeam(userSession))

      return {
        me,
        winner,
        matchSessionId: matchTable.matchSessionId,
        state: matchTable.state(),
        teams: publicTeams,
        players: publicPlayers,
        isNewHand,
        rounds,
      }
    },
  }

  return matchTable
}
