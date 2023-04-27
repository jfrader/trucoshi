import { IPlayer } from "../../types"
import { BURNT_CARD } from "../constants"

export function Player(key: string, id: string, teamIdx: number, isOwner: boolean = false) {
  const player: IPlayer = {
    key,
    id,
    session: undefined,
    teamIdx,
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
    disabled: false,
    ready: false,
    abandoned: false,
    get commands() {
      return Array.from(player._commands.values())
    },
    resetCommands() {
      player._commands = new Set()
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

      const now = Math.floor(Date.now())

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
      player.abandoned = true
    },
    setHand(hand) {
      player.prevHand = [...player.usedHand]
      player.hand = hand
      player.usedHand = []
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
    id,
    key,
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

  const { session, commands, hasFlor, envido, hand } = privateProps

  const isMe = Boolean(userSession && session === userSession)

  const meProps = isMe
    ? { isMe, commands, hasFlor, envido, hand }
    : { isMe, hand: hand.map(() => BURNT_CARD) }

  return {
    id,
    key,
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

const calculateEnvidoPointsArray = (player: IPlayer) => {
  let flor: string | null = null

  const hand = [...player.hand, ...player.usedHand].map((c) => {
    let num = c.charAt(0)
    const palo = c.charAt(1)
    if (num === "p" || num === "c" || num === "r") {
      num = "10"
    }

    if (flor === null || flor === palo) {
      flor = palo
    } else {
      flor = null
    }

    return [num, palo]
  })

  player.hasFlor = Boolean(flor)

  const possibles = hand.flatMap((v, i) => hand.slice(i + 1).map((w) => [v, w]))
  const actual = possibles.filter((couple) => couple[0][1] === couple[1][1])

  player.envido = actual.map((couple) => {
    const n1 = couple[0][0].at(-1)
    const n2 = couple[1][0].at(-1)
    return Number(n1) + Number(n2) + 20
  })

  if (player.envido.length) {
    return player.envido
  }

  player.envido = Array.from(new Set(hand.map((c) => Number(c[0].at(-1)))))

  return player.envido
}
