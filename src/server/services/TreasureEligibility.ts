import type { IPlayer } from "../../types"

type TreasureEligiblePlayer = Pick<IPlayer, "accountId" | "abandoned" | "bot" | "teamIdx">

export function getTreasureEligibleAccountIds(players: TreasureEligiblePlayer[]): number[] {
  const eligibleAccountIds = new Set<number>()

  for (const player of players) {
    if (!player.accountId || player.bot || player.abandoned) {
      continue
    }

    const hasHumanOpponent = players.some(
      (opponent) =>
        opponent !== player &&
        !opponent.bot &&
        !opponent.abandoned &&
        opponent.teamIdx !== player.teamIdx
    )

    if (hasHumanOpponent) {
      eligibleAccountIds.add(player.accountId)
    }
  }

  return Array.from(eligibleAccountIds)
}
