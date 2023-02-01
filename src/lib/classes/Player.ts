import { ICard, IPlayer } from "../types"

export type IPublicPlayer = Pick<
  IPlayer,
  "id" | "disabled" | "ready" | "hand" | "usedHand" | "prevHand" | "teamIdx" | "session" | "isTurn"
>

export function Player(id: string, teamIdx: number) {
  const player: IPlayer = {
    id,
    session: undefined,
    teamIdx,
    hand: [],
    commands: [],
    usedHand: [],
    prevHand: [],
    isTurn: false,
    disabled: false,
    ready: false,
    setTurn(turn) {
      player.isTurn = turn
    },
    getPublicPlayer() {
      return { ...player, hand: player.hand.map(() => "xx" as ICard), session: undefined }
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
