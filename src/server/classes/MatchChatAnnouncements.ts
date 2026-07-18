import type { IPlayer } from "../../types"
import type { IPlayInstance } from "../../truco"

type MatchHandStartPlay = Pick<IPlayInstance, "freshHand" | "handIdx" | "roundIdx"> & {
  player: Pick<IPlayer, "name"> | null
}

type MatchHandStartPlayer = Pick<IPlayer, "abandoned" | "disabled">

export interface IMatchChatAnnouncements {
  getHandStartMessages(play: MatchHandStartPlay, players: MatchHandStartPlayer[]): string[]
}

export const MatchChatAnnouncements = (): IMatchChatAnnouncements => {
  let announcedFirstTurn = false
  let announcedPicaPica = false

  return {
    getHandStartMessages(play, players) {
      if (!play.freshHand || play.roundIdx !== 1 || !play.player) {
        return []
      }

      const messages: string[] = []
      const isPicaPicaMiniHand =
        players.length === 6 &&
        players.every((player) => !player.abandoned) &&
        players.filter((player) => !player.disabled).length === 2

      if (isPicaPicaMiniHand && !announcedPicaPica) {
        messages.push("Empezo el Pica-Pica")
        announcedPicaPica = true
      }

      if (!announcedFirstTurn) {
        messages.push(`Es el turno de ${play.player.name}`)
        announcedFirstTurn = true
      }

      return messages
    },
  }
}
