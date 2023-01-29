import { IPlayer } from "../types"

export type IPublicPlayer = Pick<
  IPlayer,
  "id" | "disabled" | "ready" | "hand" | "usedHand" | "teamIdx" | "session"
>

export function Player(id: string, teamIdx: number) {
  const player: IPlayer = {
    id,
    session: undefined,
    teamIdx,
    hand: [],
    commands: [],
    usedHand: [],
    disabled: false,
    ready: false,
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
      player.hand = hand
      player.usedHand = []
      return hand
    },
    useCard(idx) {
      if (player.hand[idx]) {
        const card = player.hand.splice(idx, 1)[0]
        player.usedHand.push(card)
        return card
      }
      return null
    },
  }

  return player
}
