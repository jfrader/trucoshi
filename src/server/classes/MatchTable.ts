import { IHand, ILobby, Lobby } from "../../truco"
import {
  EMatchState,
  ILobbyOptions,
  IMatchFlorBattle,
  IMatchPreviousHand,
  IPlayedCard,
  IPlayer,
  IPublicMatch,
  IPublicMatchInfo,
} from "../../types"
import { IUserSession } from "./UserSession"

export interface IMatchTable {
  matchId?: number
  ownerSession: string
  matchSessionId: string
  lobby: ILobby
  busy: boolean
  awardedSatsPerPlayer: number
  playerSockets: string[]
  spectatorSockets: string[]
  state(): EMatchState
  setBusy(busy: boolean): void
  isSessionPlaying(session: string): IPlayer | null
  getPreviousHand(hand: IHand): IMatchPreviousHand
  getFlorBattle(hand: IHand): IMatchFlorBattle
  getHandRounds(hand: IHand): IPlayedCard[][]
  getPublicMatch(session?: string, freshHand?: boolean, skipPreviousHand?: boolean): IPublicMatch
  getPublicMatchInfo(): IPublicMatchInfo
  playerDisconnected(player: IPlayer): void
  playerReconnected(player: IPlayer, userSession: IUserSession): void
  setAwardedPerPlayer(award: number): void
  setMatchId(id: number): void
}

export function MatchTable(
  matchSessionId: string,
  ownerSession: IUserSession,
  options: Partial<ILobbyOptions> = {}
) {
  const table: IMatchTable = {
    ownerSession: ownerSession.session,
    matchSessionId,
    busy: false,
    lobby: Lobby(matchSessionId, ownerSession.name, options),
    awardedSatsPerPlayer: 0,
    playerSockets: [],
    spectatorSockets: [],
    setAwardedPerPlayer(award) {
      table.awardedSatsPerPlayer = award
    },
    setMatchId(id) {
      table.matchId = id
    },
    setBusy(busy) {
      table.busy = busy
    },
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
      return table.lobby.players.find((player) => player && player.session === session) || null
    },
    playerDisconnected(player) {
      player.setReady(false)
    },
    playerReconnected(player, userSession) {
      if (table.state() !== EMatchState.STARTED) {
        player.name = userSession.name
        player.avatarUrl = userSession.account?.avatarUrl
      }

      if (player.abandoned) {
        return
      }
      if (table.state() === EMatchState.STARTED) {
        player.setReady(true)
      }
    },
    getPublicMatchInfo() {
      const {
        matchSessionId,
        state,
        lobby: { playerCount, options, hostName },
      } = table
      return {
        ownerId: hostName,
        matchSessionId,
        options,
        players: playerCount,
        state: state(),
      }
    },
    getHandRounds(hand) {
      if (!hand) {
        return []
      }
      return hand.rounds.map((round) => round.cards) || []
    },
    getFlorBattle(hand) {
      const playersThatSaidFlor = table.lobby.players.filter((p) => p.hasSaidFlor)
      return {
        playersWithFlor:
          playersThatSaidFlor.length > 1
            ? playersThatSaidFlor.map((p) => ({
                idx: p.idx,
                team: p.teamIdx,
                cards: hand.flor.state === 5 ? p.flor?.cards : undefined,
                points: p.flor?.value || 0,
              }))
            : [],
        winnerTeamIdx: hand.flor.winner?.id || null,
        winner: hand.flor.winningPlayer?.getPublicPlayer() || null,
        matchSessionId: table.matchSessionId,
      }
    },
    getPreviousHand(previousHand) {
      return {
        rounds: table.getHandRounds(previousHand),
        points: previousHand.points,
        matchSessionId: table.matchSessionId,
        envido: previousHand.envido.winningPlayer && {
          winner: previousHand.envido.winningPlayer.getPublicPlayer(),
          data: previousHand.envido.winningPlayer.envido.find(
            (e) => e.value === previousHand.envido.winningPointsAnswer
          ),
        },
        flor: previousHand.flor.winningPlayer
          ? {
              winner: previousHand.flor.winningPlayer?.getPublicPlayer() || null,
              data: table.lobby.players
                .filter((p) => p.hasSaidFlor)
                .map((p) => ({
                  cards: p.flor?.cards || [],
                  idx: p.idx,
                  value: p.flor?.value || 0,
                })),
            }
          : null,
      }
    },
    getPublicMatch(userSession, freshHand, skipCurrentHand) {
      return getPublicMatch(table, userSession, freshHand, skipCurrentHand)
    },
  }

  return table
}

const getPublicMatch = (
  table: IMatchTable,
  userSession?: string,
  freshHand: boolean = false,
  skipCurrentHand: boolean = false
): IPublicMatch => {
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

  const currentHand = gameLoop?.currentHand

  return {
    id: table.matchId,
    me: me?.getPublicPlayer(userSession) || null,
    winner,
    forehandIdx: lobby.table?.forehandIdx || 0,
    options: lobby.options,
    matchSessionId: table.matchSessionId,
    state: table.state(),
    teams: publicTeams,
    players: publicPlayers,
    handState: currentHand?.state || null,
    lastCommand: gameLoop?.lastCommand,
    lastCard: gameLoop?.lastCard,
    awardedSatsPerPlayer: currentPlayerIdx !== -1 ? table.awardedSatsPerPlayer : undefined,
    freshHand,
    ownerKey: players.find((p) => p.session === table.ownerSession)?.key || "",
    rounds,
    previousHand:
      !skipCurrentHand && currentHand?.displayingPreviousHand()
        ? table.getPreviousHand(currentHand)
        : null,
    florBattle:
      (!skipCurrentHand && currentHand?.displayingFlorBattle()) ||
      (currentHand?.displayingPreviousHand() && currentHand.flor.state === 5)
        ? table.getFlorBattle(currentHand)
        : null,
    busy: table.busy,
  }
}
