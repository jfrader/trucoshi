export * from "./events"

export { CARDS, CARDS_HUMAN_READABLE, SUITS_HUMAN_READABLE, BURNT_CARD } from "./lib/constants"
export { CARD_SKINS, INVENTORY_GRANT_RELEASES, SKIN_RELEASES } from "./lib/Skins"
export { TREASURE_CONFIG, TREASURE_RARITIES } from "./lib/Treasures"

import { RequestParams, User } from "lightning-accounts"
import { Match, MatchPlayer, MatchHand, UserStats, MatchBet } from "@trucoshi/prisma"
import { IHand, IPlayInstance } from "./truco"
import { CARDS, ITable } from "./lib"
import { AxiosResponse } from "axios"
import type { ITrucoshi } from "./server"
import { BotProfile } from "./truco/Bot"

export enum EMatchState {
  UNREADY = "UNREADY",
  READY = "READY",
  STARTED = "STARTED",
  FINISHED = "FINISHED",
  PAUSED = "PAUSED",
}

export type IPublicUserStats = Omit<UserStats, "elo">

export type IPlayerRanking = Omit<
  IPublicUserStats,
  "id" | "satsBet" | "satsWon" | "satsLost"
> &
  Pick<User, "name" | "avatarUrl">

export interface IMatchDetails extends Match {
  players: Array<
    Pick<MatchPlayer, "accountId" | "teamIdx" | "name" | "idx" | "bot" | "deckSkinByCard">
  >
  hands: Array<MatchHand>
}
export interface IAccountDetails {
  stats: IPublicUserStats | null
  matches: Array<
    Match & {
      players: Pick<
        MatchPlayer,
        "accountId" | "idx" | "teamIdx" | "bot" | "name" | "deckSkinByCard"
      >[]
      bet: Pick<MatchBet, "id" | "satsPerPlayer"> | null
    }
  >
  account: User | null
}

export interface IUserData {
  key: string
  name: string
  session: string
  account: User | null
}

export interface ILobbyOptions {
  maxPlayers: 2 | 4 | 6
  faltaEnvido: 1 | 2
  flor: boolean
  matchPoint: number
  handAckTime: number
  turnTime: number
  abandonTime: number
  satsPerPlayer: number
}

export interface IJoinQueueOptions {
  maxPlayers: 0 | 2 | 4 | 6
  allowBots: boolean
}

export interface IQueueStatus {
  requestId: string
  maxPlayers: 0 | 2 | 4 | 6
  queuedPlayers: number
  requiredPlayers: number
  position: number
  queuedAt: number
  botFallbackAt?: number
}

export interface IQueueMatchFound {
  matchSessionId: string
  maxPlayers: 2 | 4 | 6
  humanPlayers: number
  botPlayers: number
  filledWithBots: boolean
}

export interface ISaidCommand {
  player: IPlayer | IPublicPlayer
  command: ECommand | number
}

export interface IMatchFlorBattle {
  matchSessionId: string
  playersWithFlor: { team: 0 | 1; idx: number; cards?: ICard[]; points: number }[]
  winnerTeamIdx: 0 | 1 | null
  winner: IPublicPlayer | null
}

export interface IMatchPreviousHand {
  envido: { winner: IPublicPlayer; data?: { value: number; cards: ICard[] } } | null
  flor: {
    winner: IPublicPlayer | null
    data: Array<{ idx: number; value: number; cards: ICard[] }>
  } | null
  rounds: IPlayedCard[][]
  points: IHandPoints
  matchSessionId: string
}

export interface IPublicMatch {
  id?: number
  options: ILobbyOptions
  createdFromQueue: boolean
  queueOptions?: IJoinQueueOptions
  busy: boolean
  state: EMatchState
  handState: EHandState | null
  florBattle: IMatchFlorBattle | null
  previousHand: IMatchPreviousHand | null
  winner: ITeam | null
  matchSessionId: string
  forehandIdx: number
  ownerKey: string
  teams: Array<IPublicTeam>
  players: Array<IPublicPlayer>
  me: IPublicPlayer | null
  freshHand: boolean
  rounds: IPlayedCard[][]
  lastCard?: ICard | null
  lastCommand?: ECommand | number | null
  awardedSatsPerPlayer?: number
}

export interface IPublicMatchStats {
  spectators: number
}

export interface IPublicMatchInfo {
  ownerId: string
  matchSessionId: string
  players: number
  options: ILobbyOptions
  state: EMatchState
  winnerTeamIdx: 0 | 1 | undefined
  createdFromQueue: boolean
  queueOptions?: IJoinQueueOptions
}

export type IPublicChatRoom = Pick<IChatRoom, "id" | "messages">
export interface IChatMessage {
  id: string
  date: number
  user: { name: string; key: string; teamIdx?: 0 | 1 }
  system?: boolean
  hidden?: boolean
  command?: boolean
  card?: boolean
  content: string
  sound: string | boolean
}

export interface IChatRoom {
  id: string
  messages: Array<IChatMessage>
  socket: {
    emit(socket: string): void
  }
  send(user: IChatMessage["user"], message: string, sound?: string | boolean): void
  card(user: IChatMessage["user"], card: ICard, sound?: string | boolean): void
  command(team: 0 | 1, command: ECommand | number, sound?: string | boolean): void
  system(message: string, sound?: string | boolean): void
  sound(sound: string, toTeamIdx?: "0" | "1", fromUser?: IChatMessage["user"]): void
  emit(message?: IChatMessage, teamIdxs?: string): void
}

export enum EChatSystem {
  TEAM_0 = 0,
  TEAM_1 = 1,
  SYSTEM = "SYSTEM",
}

export enum ESayCommand {
  MAZO = "MAZO",
  PASO = "PASO",
}

export enum EFlorCommand {
  FLOR = "FLOR",
  CONTRAFLOR = "CONTRAFLOR",
  CONTRAFLOR_AL_RESTO = "CONTRAFLOR_AL_RESTO",
  ACHICO = "ACHICO",
}

export enum ETrucoCommand {
  TRUCO = "TRUCO",
  RE_TRUCO = "RE_TRUCO",
  VALE_CUATRO = "VALE_CUATRO",
}

export enum EAnswerCommand {
  QUIERO = "QUIERO",
  NO_QUIERO = "NO_QUIERO",
}

export enum EEnvidoAnswerCommand {
  SON_BUENAS = "SON_BUENAS",
}

export enum EEnvidoCommand {
  FALTA_ENVIDO = "FALTA_ENVIDO",
  REAL_ENVIDO = "REAL_ENVIDO",
  ENVIDO = "ENVIDO",
}

export enum EHandState {
  WAITING_PLAY = "WAITING_PLAY",
  WAITING_FOR_TRUCO_ANSWER = "WAITING_FOR_TRUCO_ANSWER",
  WAITING_ENVIDO_ANSWER = "WAITING_ENVIDO_ANSWER",
  WAITING_ENVIDO_POINTS_ANSWER = "WAITING_ENVIDO_POINTS_ANSWER",
  WAITING_FLOR_ANSWER = "WAITING_FLOR_ANSWER",
  DISPLAY_FLOR_BATTLE = "DISPLAY_FLOR_BATTLE",
  DISPLAY_PREVIOUS_HAND = "DISPLAY_PREVIOUS_HAND",
  FINISHED = "FINISHED",
}

export type ECommand =
  | ESayCommand
  | EEnvidoCommand
  | EAnswerCommand
  | EEnvidoAnswerCommand
  | ETrucoCommand
  | EFlorCommand

export type IHandCommands = {
  [key in ECommand]: (hand: IHand, player: IPlayer) => void
}

export type IWaitingPlayData = { cardIdx: number; card: ICard }
export type IWaitingPlayCallback = (data: IWaitingPlayData) => void | null

export type IWaitingSayData = { command: ECommand | number }
export type IWaitingSayCallback = (data: IWaitingSayData) => void | null

export enum GAME_ERROR {
  INVALID_IDENTITY = "INVALID_IDENTITY",
  UNEXPECTED_ERROR = "UNEXPECTED_ERROR",
  FORBIDDEN = "FORBIDDEN",
  INVALID_INPUT = "INVALID_INPUT",
  NOT_FOUND = "NOT_FOUND",
  MATCH_ALREADY_STARTED = "MATCH_ALREADY_STARTED",
  LOBBY_IS_FULL = "LOBBY_IS_FULL",
  UNEXPECTED_TEAM_SIZE = "UNEXPECTED_TEAM_SIZE",
  TEAM_NOT_READY = "TEAM_NOT_READY",
  TEAM_IS_FULL = "TEAM_IS_FULL",
  ENVIDO_NOT_ACCEPTED = "ENVIDO_NOT_ACCEPTED",
  INVALID_COMMAND = "INVALID_COMMAND",
  INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
  GAME_REQUIRES_ACCOUNT = "GAME_REQUIRES_ACCOUNT",
  NO_FLOR = "NO_FLOR",
  INVALID_SESSION = "INVALID_SESSION",
  PAYMENT_REQUIRED = "PAYMENT_REQUIRED",
  PAYMENT_ERROR = "PAYMENT_ERROR",
  REWARD_CODE_INVALID = "REWARD_CODE_INVALID",
  REWARD_CODE_REDEEMED = "REWARD_CODE_REDEEMED",
}

export interface EnvidoState {
  accept: number
  decline: number
  teamIdx: 0 | 1 | null
}

export type IEnvidoCalculatorResult = {
  accept: number
  replace?: number
  next: Array<ECommand>
}

export type IFaltaEnvidoCalculatorArgs = {
  teams: [ITeam, ITeam]
  options: ILobbyOptions
}

export type IEnvidoCalculatorArgs = {
  stake: number
} & (IFaltaEnvidoCalculatorArgs | never)

export type IEnvidoCalculator = {
  [key in EEnvidoCommand]: (args?: IEnvidoCalculatorArgs) => IEnvidoCalculatorResult
}

export interface IDeck {
  random: IRandom
  cards: Array<ICard>
  usedCards: Array<ICard>
  pick(card: ICard): ICard | null
  takeCard(): ICard
  takeThree(): [ICard, ICard, ICard]
  shuffle(dealerIdx: number): IDeck
}

export type ICard = keyof typeof CARDS

export type CardSkinId = string

export type CardSkinRarity = "COMMON" | "RARE" | "EPIC" | "LEGENDARY" | "PROMO"

export interface ICardSkin {
  id: CardSkinId
  release: string
  card: ICard
  description?: string | null
  fileName: string
  assetPath: string
  rarity: CardSkinRarity
  enabled: boolean
  unlockable: boolean
}

export type IEquippedDeck = Partial<Record<ICard, CardSkinId>>

export interface IInventoryCardSkin extends ICardSkin {
  unlocked: boolean
  equipped: boolean
}

export interface IInventoryCardGroup {
  card: ICard
  skins: IInventoryCardSkin[]
  equippedCardSkinId?: CardSkinId
}

export interface ITreasureConfig {
  eligibleMatchesPerChest: number
  rarityWeights: Record<CardSkinRarity, number>
}

export interface ITreasureChest {
  id: number
  sourceMatchId?: number | null
  earnedAt: string
}

export interface ITreasureStatus {
  progress: number
  threshold: number
  unopenedChests: ITreasureChest[]
}

export interface ITreasureOpenResult {
  chestId: number
  rarity: CardSkinRarity | null
  cardSkin: ICardSkin | null
  duplicate: boolean
  granted: boolean
}

export interface IAdminOnlineAccount {
  accountId: number
  name: string
  avatarUrl?: string | null
  role?: User["role"]
  online: boolean
}

export interface IAdminRewardCodeSummary {
  id: number
  codePreview: string
  createdByAccountId: number
  intendedAccountId?: number | null
  note?: string | null
  createdAt: string
  redeemedAt?: string | null
  redeemedByAccountId?: number | null
  treasureChestId?: number | null
}

export type NoticeBannerSeverity = "info" | "warning" | "error" | "success"

export interface IPublicNoticeBanner {
  id: number
  text: string
  severity: NoticeBannerSeverity
  buttonText?: string | null
  buttonHref?: string | null
  updatedAt: string
}

export interface IAdminNoticeBanner extends IPublicNoticeBanner {
  active: boolean
  updatedByAccountId: number
  createdAt: string
}

export interface IAdminDashboard {
  onlineAccounts: IAdminOnlineAccount[]
  liveGames: IPublicMatchInfo[]
  rewardCodes: IAdminRewardCodeSummary[]
  noticeBanner: IAdminNoticeBanner | null
}

export interface IAdminCreateChestRewardCodeInput {
  intendedAccountId?: number | null
  note?: string | null
}

export interface IAdminCreateChestRewardCodeResult {
  code: string
  link: string
  rewardCode: IAdminRewardCodeSummary
}

export interface IAdminSetNoticeBannerInput {
  active: boolean
  text?: string | null
  severity?: NoticeBannerSeverity | null
  buttonText?: string | null
  buttonHref?: string | null
}

export interface IAdminSetNoticeBannerResult {
  noticeBanner: IAdminNoticeBanner | null
  publicNoticeBanner: IPublicNoticeBanner | null
}

export interface IRewardCodeRedeemResult {
  grantedChest: ITreasureChest
  treasureStatus: ITreasureStatus
}

export interface IPlayedCard {
  key: string
  player: IPlayer | IPublicPlayer
  card: ICard
  cardSkinId?: CardSkinId
}

export interface IHandPoints {
  0: number
  1: number
}

export interface IRandom {
  secret: string
  clients: string[]
  bitcoinHash: string
  bitcoinHeight: number
  nonce: number
  getLatestBitcoinBlock(
    fn: (params?: RequestParams) => Promise<
      AxiosResponse<
        {
          hash: string
          height: number
        },
        any
      >
    >
  ): Promise<void>
  next(): void
  pick(idx: number, max: number): number
  reveal(): { secret: string; clients: string[]; bitcoinHash: string; bitcoinHeight: number }
}

export type IPublicPlayer = Pick<
  IPlayer,
  | "idx"
  | "key"
  | "name"
  | "bot"
  | "abandonedTime"
  | "accountId"
  | "avatarUrl"
  | "disabled"
  | "abandoned"
  | "ready"
  | "hand"
  | "usedHand"
  | "prevHand"
  | "teamIdx"
  | "isTurn"
  | "turnExpiresAt"
  | "turnExtensionExpiresAt"
  | "isEnvidoTurn"
  | "isOwner"
  | "hasSaidFlor"
  | "hasSaidEnvidoPoints"
  | "hasSaidTruco"
  | "hasPassed"
  | "deckSkinByCard"
> &
  (
    | {
        isMe?: true
        commands: IPlayer["commands"]
        hasFlor: IPlayer["hasFlor"]
        envido: IPlayer["envido"]
        payRequestId?: IPlayer["payRequestId"]
      }
    | {
        isMe?: false
        commands?: undefined
        hasFlor?: undefined
        envido?: undefined
        payRequestId?: undefined
      }
  )

export type IPublicTeam = Pick<ITeam, "points" | "id" | "name"> & { players: Array<IPublicPlayer> }

export interface OpponentProfile {
  bluffCount: number
  foldCount: number
  aggression: number
}

export interface IPlayer {
  idx: number
  secret: string
  teamIdx: 0 | 1
  accountId: number | undefined
  matchPlayerId: number | undefined
  avatarUrl: string | undefined | null
  name: string
  key: string
  bot: BotProfile | null
  session: string
  payRequestId?: number
  abandonedTime: number
  disconnectedAt: number | null
  hand: Array<ICard>
  usedHand: Array<ICard>
  prevHand: Array<ICard>
  envido: Array<{ value: number; cards: ICard[] }>
  _commands: Set<ECommand>
  get commands(): Array<ECommand>
  isTurn: boolean
  turnExpiresAt: number | null
  turnExtensionExpiresAt: number | null
  hasFlor: boolean
  flor: { value: number; cards: ICard[] } | null
  _didSomething: boolean
  get didSomething(): boolean
  set didSomething(value: boolean)
  hasSaidFlor: boolean
  hasSaidEnvidoPoints: boolean
  hasSaidTruco: boolean
  hasPassed: boolean
  isEnvidoTurn: boolean
  isOwner: boolean
  disabled: boolean
  abandoned: boolean
  ready: boolean
  opponentProfiles: Record<string, OpponentProfile>
  deckSkinByCard: IEquippedDeck
  getCardSkinId(card: ICard): CardSkinId | undefined
  setDeckSkinByCard(deck: IEquippedDeck): void
  getRandomCard(): [number, ICard]
  getHighestCard(): [number, ICard]
  getLowestCard(): [number, ICard]
  getHighestEnvido(): number
  saidEnvidoPoints(): void
  saidFlor(): void
  saidTruco(): void
  passed(): void
  resetPassed(): void
  resetCommands(): void
  calculateEnvido(): Array<{ value: number; cards: ICard[] }>
  setIdx(idx: number): void
  setPayRequest(id?: number): void
  setMatchPlayerId(id?: number): void
  setTurn(turn: boolean): void
  delayTurnExpiration(ms: number): void
  setTurnExpiration(...args: [number, number | null] | [null, null]): void
  setEnvidoTurn(turn: boolean): void
  getPublicPlayer(session?: string | "log"): IPublicPlayer
  setSession(session: string): void
  setIsOwner(isOwner: boolean): void
  addDisconnectedTime(time: number): void
  rename(name: string): void
  enable(): void
  disable(): void
  abandon(): void
  setReady(ready: boolean): void
  setHand(hand: Array<ICard>): Array<ICard>
  useCard(idx: number, card: ICard): ICard | null
  sayCommand(command: ECommand | number, force?: boolean): false | ECommand | number
  playBot(
    table: ITable,
    play: IPlayInstance,
    playCard: ITrucoshi["playCard"],
    sayCommand: ITrucoshi["sayCommand"]
  ): Promise<void>
}

export interface ITeam {
  _players: Map<string, IPlayer>
  id: 0 | 1
  name: string
  players: Array<IPlayer>
  points: ITeamPoints
  get activePlayers(): IPlayer[]
  setPlayers(players: IPlayer[]): ITeam
  pointsToWin(matchPoint: number): number
  getPublicTeam(playerSession?: string): IPublicTeam
  isTeamDisabled(): boolean
  isTeamAbandoned(): boolean
  disable(player: IPlayer): boolean
  abandon(player: IPlayer): boolean
  enable(player?: IPlayer): boolean
  resetPassed(): void
  addPoints(matchPoint: number, points: number, simulate?: boolean): ITeamPoints
}

export interface ITeamPoints {
  buenas: number
  malas: number
  winner: boolean
}

export type IHandRoundLog = {
  player: number
  card?: ICard
  command?: ECommand | number
}

export type IPublicUser = Pick<User, "id" | "email" | "name" | "role">

export const DANGEROUS_COMMANDS: ECommand[] = [
  ESayCommand.MAZO,
  EAnswerCommand.NO_QUIERO,
  EEnvidoAnswerCommand.SON_BUENAS,
  EFlorCommand.ACHICO,
]

export const WARNING_COMMANDS: ECommand[] = [ESayCommand.PASO]

export type ITrucoshiStats = {
  onlinePlayers: number[]
}
