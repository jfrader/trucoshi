import { IHand, ILobby, Lobby } from "../../lib"
import {
  EMatchState,
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
  state(): EMatchState
  isSessionPlaying(session: string): IPlayer | null
  getPreviousHand(hand: IHand): IMatchPreviousHand
  getHandRounds(hand: IHand): IPlayedCard[][]
  getPublicMatch(session?: string, freshHand?: boolean): IPublicMatch
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
        return EMatchState.FINISHED
      }
      if (table.lobby.started) {
        return EMatchState.STARTED
      }
      if (table.lobby.ready) {
        return EMatchState.READY
      }
      return EMatchState.UNREADY
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
      if (table.state() === EMatchState.STARTED) {
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
        lobby: { players, options },
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
    getPublicMatch(userSession, freshHand) {
      return getPublicMatch(table, userSession, freshHand)
    },
  }

  return table
}

const getPublicMatch = (table: IMatchTable, userSession?: string, freshHand: boolean = false) => {
  const { lobby } = table
  const { gameLoop } = lobby

  const winner = gameLoop?.winner || null

  const rounds = gameLoop?.currentHand ? table.getHandRounds(gameLoop?.currentHand) : []

  const players = lobby.players.filter((player) => Boolean(player)) as IPlayer[]

  const currentPlayerIdx = players.findIndex((player) => player && player.session === userSession)

  const me = currentPlayerIdx !== -1 ? players[currentPlayerIdx] : null

  const publicPlayers = (
    lobby.table ? lobby.table.getPlayersForehandFirst(me ? currentPlayerIdx : 0) : players
  ).map((player) => player.getPublicPlayer(userSession))

  const teams = gameLoop?.teams || lobby.teams
  const publicTeams = teams.map((team) => team.getPublicTeam(userSession))

  return {
    me,
    winner,
    options: lobby.options,
    matchSessionId: table.matchSessionId,
    state: table.state(),
    teams: publicTeams,
    players: publicPlayers,
    lastCommand: gameLoop?.lastCommand,
    lastCard: gameLoop?.lastCard,
    freshHand,
    rounds,
  }
}
