import {
  EAnswerCommand,
  ECommand,
  EEnvidoAnswerCommand,
  EEnvidoCommand,
} from "../../types"
import { ICard } from "./Deck"

export interface IPlayer {
  teamIdx: number
  id: string
  key: string
  session?: string
  hand: Array<ICard>
  envido: Array<number>
  _commands: Set<ECommand>
  get commands(): Array<ECommand>
  usedHand: Array<ICard>
  prevHand: Array<ICard>
  isTurn: boolean
  hasFlor: boolean
  isEnvidoTurn: boolean
  isOwner: boolean
  disabled: boolean
  ready: boolean
  resetCommands(): void
  calculateEnvido(): Array<number>
  setTurn(turn: boolean): void
  setEnvidoTurn(turn: boolean): void
  getPublicPlayer(): IPublicPlayer
  setSession(session: string): void
  enable(): void
  disable(): void
  setReady(ready: boolean): void
  setHand(hand: Array<ICard>): Array<ICard>
  useCard(idx: number, card: ICard): ICard | null
}

export type IPublicPlayer = Pick<
  IPlayer,
  | "id"
  | "key"
  | "disabled"
  | "ready"
  | "hand"
  | "envido"
  | "usedHand"
  | "prevHand"
  | "teamIdx"
  | "session"
  | "hasFlor"
  | "isTurn"
  | "isEnvidoTurn"
  | "isOwner"
> & {
  commands: Array<ECommand>
}

const filterEnvidoCommands = (command: any) =>
  Object.values(EEnvidoCommand).includes(command) ||
  Object.values(EAnswerCommand).includes(command) ||
  Object.values(EEnvidoAnswerCommand).includes(command)

const filterNotEnvidoCommands = (command: any) =>
  !Object.values(EEnvidoCommand).includes(command) &&
  !Object.values(EEnvidoAnswerCommand).includes(command)

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
    hasFlor: false,
    isEnvidoTurn: false,
    disabled: false,
    ready: false,
    get commands() {
      return Array.from(player._commands.values())
    },
    resetCommands() {
      player._commands = new Set()
    },
    setTurn(turn) {
      player.isTurn = turn
    },
    setEnvidoTurn(turn) {
      player.isTurn = turn
      player.isEnvidoTurn = turn
    },
    getPublicPlayer() {
      const {
        id,
        key,
        commands,
        disabled,
        ready,
        usedHand,
        prevHand,
        teamIdx,
        hasFlor,
        isTurn,
        isEnvidoTurn,
        isOwner,
        envido,
      } = player
      return {
        id,
        key,
        commands,
        disabled,
        ready,
        envido,
        usedHand,
        prevHand,
        teamIdx,
        hasFlor,
        isTurn,
        isEnvidoTurn,
        isOwner,
        hand: player.hand.map(() => "xx" as ICard),
        session: undefined,
      }
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
    calculateEnvido() {
      let flor: string | null = null

      const hand = player.hand.map((c) => {
        let num = c.charAt(0)
        const palo = c.charAt(1)
        if (num === "p") {
          num = "10"
        }
        if (num === "c") {
          num = "11"
        }
        if (num === "r") {
          num = "12"
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
        player.isTurn = false
        return playedCard
      }
      return null
    },
  }

  return player
}
