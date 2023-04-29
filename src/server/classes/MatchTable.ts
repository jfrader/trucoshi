import { IHand, ILobby, Lobby } from "../../lib"
import {
  EMatchTableState,
  ILobbyOptions,
  IMatchPreviousHand,
  IPlayedCard,
  IPlayer,
  IPublicMatch,
  IPublicMatchInfo,
} from "../../types"

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
  playerDisconnected(player: IPlayer): void
  playerReconnected(player: IPlayer): void
  playerAbandoned(player: IPlayer): void
}

export function MatchTable(
  matchSessionId: string,
  ownerSession: string,
  options: Partial<ILobbyOptions> = {}
) {
  const table: IMatchTable = {
    ownerSession,
    matchSessionId,
    lobby: Lobby(options),
    state() {
      table.lobby.calculateReady()
      if (table.lobby.gameLoop?.winner) {
        return EMatchTableState.FINISHED
      }
      if (table.lobby.started) {
        return EMatchTableState.STARTED
      }
      if (table.lobby.ready) {
        return EMatchTableState.READY
      }
      return EMatchTableState.UNREADY
    },
    isSessionPlaying(session) {
      const {
        lobby: { players },
      } = table
      return players.find((player) => player && player.session === session) || null
    },
    playerDisconnected(player) {
      player.setReady(false)
    },
    playerReconnected(player) {
      if (player.abandoned) {
        return
      }
      if (table.state() === EMatchTableState.STARTED) {
        player.setReady(true)
      }
    },
    playerAbandoned(player) {
      player.abandon()
    },
    getPublicMatchInfo() {
      const {
        matchSessionId,
        state,
        lobby: {
          players,
          options
        },
      } = table
      return {
        ownerId: players.find((player) => player.isOwner)?.id as string,
        matchSessionId,
        options,
        players: players.length,
        state: state(),
      }
    },
    getHandRounds(hand) {
      if (!hand) {
        return []
      }
      return hand.rounds.map((round) => round.cards) || []
    },
    getPreviousHand(hand) {
      return {
        rounds: table.getHandRounds(hand),
        points: hand.points,
        matchSessionId: table.matchSessionId,
      }
    },
    getPublicMatch(userSession, isNewHand) {
      return getPublicMatch(table, userSession, isNewHand)
    },
  }

  return table
}

const getPublicMatch = (table: IMatchTable, userSession?: string, isNewHand: boolean = false) => {
  const { lobby } = table

  const winner = lobby.gameLoop?.winner || null

  const rounds = lobby.gameLoop?.currentHand ? table.getHandRounds(lobby.gameLoop?.currentHand) : []

  const players = lobby.players.filter((player) => Boolean(player)) as IPlayer[]

  const currentPlayerIdx = players.findIndex((player) => player && player.session === userSession)

  const me = currentPlayerIdx !== -1 ? players[currentPlayerIdx] : null

  const publicPlayers = (
    lobby.table ? lobby.table.getPlayersForehandFirst(me ? currentPlayerIdx : 0) : players
  ).map((player) => player.getPublicPlayer(userSession))

  const teams = lobby.gameLoop?.teams || lobby.teams
  const publicTeams = teams.map((team) => team.getPublicTeam(userSession))

  return {
    me,
    winner,
    matchSessionId: table.matchSessionId,
    state: table.state(),
    teams: publicTeams,
    players: publicPlayers,
    isNewHand,
    rounds,
  }
}
