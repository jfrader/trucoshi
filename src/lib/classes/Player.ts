import { IPlayer } from "../types"

export function Player(id: string, teamIdx: number) {
  const player: IPlayer = {
    id,
    teamIdx,
    hand: [],
    commands: [],
    usedHand: [],
    disabled: false,
    ready: false,
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
