import { ECommand } from "../../types"
import { ICard } from "./Deck"

export interface IPlayer {
  teamIdx: number
  id: string
  key: string
  session?: string
  hand: Array<ICard>
  commands: Array<ECommand>
  usedHand: Array<ICard>
  prevHand: Array<ICard>
  isTurn: boolean
  isOwner: boolean
  disabled: boolean
  ready: boolean
  connected: boolean
  setTurn(turn: boolean): void
  getPublicPlayer(): IPublicPlayer
  setSession(session: string): void
  enable(): void
  disable(): void
  setConnected(connected: boolean): void
  setOwner(owner: boolean): void
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
  | "connected"
  | "hand"
  | "usedHand"
  | "prevHand"
  | "teamIdx"
  | "session"
  | "isTurn"
  | "isOwner"
>

export function Player(key: string, id: string, teamIdx: number, isOwner: boolean = false) {

  const player: IPlayer = {
    key,
    id,
    session: undefined,
    teamIdx,
    hand: [],
    commands: [],
    usedHand: [],
    prevHand: [],
    isOwner,
    isTurn: false,
    disabled: false,
    connected: false,
    ready: false,
    setOwner(owner) {
      player.isOwner = owner
    },
    setTurn(turn) {
      player.isTurn = turn
    },
    getPublicPlayer() {
      const { id, key, connected, disabled, ready, usedHand, prevHand, teamIdx, isTurn, isOwner } = player
      return {
        id,
        key,
        connected, 
        disabled,
        ready,
        usedHand,
        prevHand,
        teamIdx,
        isTurn,
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
    setConnected(connected) {
      player.connected = connected
    },
    setReady(ready) {
      player.ready = ready
    },
    setHand(hand) {
      player.prevHand = [...player.usedHand]
      player.hand = hand
      player.usedHand = []
      return hand
    },
    useCard(idx, card) {
      if (player.hand[idx] && player.hand[idx] === card) {
        const card = player.hand.splice(idx, 1)[0]
        player.usedHand.push(card)
        return card
      }
      return null
    },
  }

  return player
}
