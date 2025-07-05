import { randomUUID } from "crypto"
import { BURNT_CARD, ICard, IPlayer } from "../types"
import { maxBy } from "../utils/array"

export function Player({
  accountId,
  key,
  name,
  teamIdx,
  avatarUrl,
  isOwner = false,
}: {
  accountId: number | undefined
  avatarUrl: string | undefined
  key: string
  name: string
  teamIdx: number
  isOwner?: boolean
}) {
  const player: IPlayer = {
    idx: -1,
    key,
    secret: randomUUID(),
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
    isOwner,
    isTurn: false,
    turnExpiresAt: null,
    turnExtensionExpiresAt: null,
    hasFlor: false,
    isEnvidoTurn: false,
    hasSaidEnvidoPoints: false,
    hasSaidFlorPoints: false,
    disabled: false,
    ready: false,
    abandoned: false,
    get commands() {
      return Array.from(player._commands.values())
    },
    saidEnvidoPoints() {
      player.hasSaidEnvidoPoints = true
    },

    saidFlorPoints() {
      player.hasSaidFlorPoints = true
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
      player.hasSaidEnvidoPoints = false
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
        return playedCard
      }
      return null
    },
  }

  return player
}

const getPublicPlayer = (
  player: IPlayer,
  userSession?: string
): ReturnType<IPlayer["getPublicPlayer"]> => {
  const {
    name,
    idx,
    accountId,
    abandonedTime,
    key,
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
    ...privateProps
  } = player

  const { session, commands, hasFlor, envido, hand, payRequestId } = privateProps

  const isMe = Boolean(userSession && session === userSession)

  const meProps = isMe
    ? { isMe, commands, hasFlor, envido, hand, payRequestId }
    : { isMe, hand: hand.map(() => BURNT_CARD) }

  return {
    name,
    idx,
    accountId,
    abandonedTime,
    key,
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
    ...meProps,
  }
}

interface ISplittedCard {
  value: number
  palo: string
  card: ICard
  envidoValue: number
}

export function splitCardvalues(card: ICard): ISplittedCard {
  let value = card.charAt(0)
  const palo = card.charAt(1)
  if (value === "p" || value === "c" || value === "r") {
    value = "10"
  }

  return { value: Number(value), palo, card, envidoValue: Number(value.at(-1)) }
}

const calculateEnvidoPointsArray = (player: IPlayer): IPlayer["envido"] => {
  const hand = [...player.hand, ...player.usedHand].map(splitCardvalues)

  player.hasFlor = Boolean(
    hand.reduce((prev, curr) => {
      if (prev === curr.palo) {
        return curr.palo
      }
      return ""
    }, hand[0].palo)
  )

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
