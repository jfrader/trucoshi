import { randomUUID } from "crypto"
import { ICard, IPlayer, DANGEROUS_COMMANDS } from "../types"
import { maxBy } from "../utils/array"
import { BURNT_CARD, CARDS } from "../lib/constants"
import { getMaxNumberIndex, getMinNumberIndex } from "../lib/utils"
import { BotProfile, playBot } from "./Bot"
import { rng } from "../lib"

export function Player({
  accountId,
  key,
  name,
  teamIdx,
  avatarUrl,
  bot,
  isOwner = false,
}: {
  accountId: number | undefined
  avatarUrl: string | undefined
  key: string
  name: string
  teamIdx: 0 | 1
  isOwner?: boolean
  bot?: BotProfile
}) {
  const player: IPlayer = {
    idx: -1,
    key,
    secret: rng.generateServerSeed(),
    bot: bot || null,
    accountId,
    matchPlayerId: undefined,
    payRequestId: undefined,
    avatarUrl,
    name,
    session: "",
    teamIdx,
    abandonedTime: 0,
    hand: [],
    _commands: new Set(),
    usedHand: [],
    prevHand: [],
    envido: [],
    flor: null,
    isOwner,
    isTurn: false,
    turnExpiresAt: null,
    turnExtensionExpiresAt: null,
    hasFlor: false,
    isEnvidoTurn: false,
    hasSaidEnvidoPoints: false,
    hasSaidFlor: false,
    hasSaidTruco: false,
    disabled: false,
    ready: false,
    abandoned: false,
    get commands() {
      return Array.from(player._commands.values())
    },
    get positiveCommands() {
      return player.commands.filter((c) => !DANGEROUS_COMMANDS.includes(c))
    },
    getRandomCard() {
      const randomIdx = Math.floor(Math.random() * player.hand.length)
      return [randomIdx, player.hand[randomIdx]]
    },
    getHighestCard() {
      const highestIdx = getMaxNumberIndex(player.hand.map((c) => CARDS[c]))
      return [highestIdx, player.hand[highestIdx]]
    },
    getLowestCard() {
      const highestIdx = getMinNumberIndex(player.hand.map((c) => CARDS[c]))
      return [highestIdx, player.hand[highestIdx]]
    },
    getHighestEnvido() {
      return player.envido.reduce((p, c) => Math.max(p, c.value), 0)
    },
    saidEnvidoPoints() {
      player.hasSaidEnvidoPoints = true
    },
    saidFlor() {
      player.hasSaidFlor = true
    },
    saidTruco() {
      player.hasSaidTruco = true
    },
    resetCommands() {
      player._commands = new Set()
    },
    setIdx(idx) {
      player.idx = idx
    },
    setMatchPlayerId(id) {
      player.matchPlayerId = id
    },
    setPayRequest(id) {
      player.payRequestId = id
    },
    addDisconnectedTime(time) {
      player.abandonedTime = player.abandonedTime + time
    },
    setTurn(turn) {
      if (!turn) {
        player.turnExpiresAt = null
        player.turnExtensionExpiresAt = null
      }
      player.isTurn = turn
    },
    setTurnExpiration(expiresInMs, extensionInMs) {
      if (expiresInMs && player.turnExpiresAt) {
        return
      }

      const now = Date.now()

      if (expiresInMs) {
        player.turnExpiresAt = now + expiresInMs
        player.turnExtensionExpiresAt = player.turnExpiresAt + (extensionInMs || 0)
        return
      }

      player.turnExpiresAt = null
      player.turnExtensionExpiresAt = null
    },
    setIsOwner(isOwner) {
      player.isOwner = isOwner
    },
    setEnvidoTurn(turn) {
      player.isTurn = turn
      player.isEnvidoTurn = turn
    },
    setSession(session: string) {
      player.session = session
    },
    rename(name) {
      if (!name) return
      player.name = name
    },
    enable() {
      player.disabled = false
    },
    disable() {
      player.disabled = true
    },
    setReady(ready) {
      player.ready = ready
    },
    getPublicPlayer(userSession) {
      return getPublicPlayer(player, userSession)
    },
    calculateEnvido() {
      return calculateEnvidoPointsArray(player)
    },
    abandon() {
      player.disabled = true
      player.abandoned = true
    },
    setHand(hand) {
      player.hasFlor = false
      player.hasSaidFlor = false
      player.hasSaidEnvidoPoints = false
      player.hasSaidTruco = false
      player.flor = null
      player.envido = []
      player.prevHand = [...player.usedHand]
      player.hand = hand
      player.usedHand = []
      player.calculateEnvido()
      return hand
    },
    useCard(idx, card) {
      if (player.hand[idx] && player.hand[idx] === card) {
        const playedCard = player.hand.splice(idx, 1)[0]
        player.usedHand.push(playedCard)
        player.hasFlor = false
        return playedCard
      }
      return null
    },
    playBot(table, play, playCard, sayCommand) {
      return playBot(table, player, play, playCard, sayCommand)
    },
  }

  return player
}

const getPublicPlayer = (
  player: IPlayer,
  userSession?: string | "log"
): ReturnType<IPlayer["getPublicPlayer"]> => {
  const {
    name,
    idx,
    accountId,
    abandonedTime,
    key,
    bot,
    avatarUrl,
    abandoned,
    disabled,
    ready,
    usedHand,
    prevHand,
    teamIdx,
    turnExpiresAt,
    turnExtensionExpiresAt,
    isTurn,
    isEnvidoTurn,
    isOwner,
    hasSaidEnvidoPoints,
    hasSaidFlor,
    hasSaidTruco,
    ...privateProps
  } = player

  const { session, commands, hasFlor, envido, hand, payRequestId, flor } = privateProps

  const isMe = Boolean(userSession === "log" || session === userSession)

  const meProps = isMe
    ? { isMe, commands, hasFlor, envido, hand, flor, payRequestId }
    : { isMe, hand: hand.map(() => BURNT_CARD) }

  return {
    name,
    idx,
    accountId,
    abandonedTime,
    key,
    bot,
    avatarUrl,
    abandoned,
    teamIdx,
    disabled,
    ready,
    usedHand,
    prevHand,
    turnExpiresAt,
    turnExtensionExpiresAt,
    isTurn,
    isEnvidoTurn,
    isOwner,
    hasSaidEnvidoPoints,
    hasSaidFlor,
    hasSaidTruco,
    ...meProps,
  }
}

interface ISplittedCard {
  value: number
  palo: string
  card: ICard
  envidoValue: number
}

function splitCardvalues(card: ICard): ISplittedCard {
  let value = card.charAt(0)
  const palo = card.charAt(1)
  if (value === "p" || value === "c" || value === "r") {
    value = "10"
  }

  return { value: Number(value), palo, card, envidoValue: Number(value.at(-1)) }
}

const calculateEnvidoPointsArray = (player: IPlayer): IPlayer["envido"] => {
  const cards = [...player.hand, ...player.usedHand]
  const hand = cards.map(splitCardvalues)

  const hasFlor = hand.every((card) => card.palo === hand[0].palo)

  player.hasFlor = hasFlor
  player.flor = hasFlor
    ? { cards, value: hand.reduce((sum, card) => sum + card.envidoValue, 20) }
    : null

  const possibles = hand.flatMap((v, i) => hand.slice(i + 1).map((w) => [v, w]))
  const actual = possibles.filter((couple) => couple[0].palo === couple[1].palo)

  const envido = actual.map((couple) => {
    return {
      value: couple[0].envidoValue + couple[1].envidoValue + 20,
      cards: [couple[0].card, couple[1].card],
    }
  })

  if (envido.length) {
    player.envido = envido.filter((e, i, arr) => arr.findIndex((v) => v.value === e.value) === i)
    return player.envido
  }

  const biggestCard = maxBy(hand, (c) => c.envidoValue)

  player.envido = [
    biggestCard
      ? { value: biggestCard.envidoValue, cards: [biggestCard.card] }
      : { value: 0, cards: [] },
  ]

  return player.envido
}
