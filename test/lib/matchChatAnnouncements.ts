import { expect } from "chai"
import { MatchChatAnnouncements } from "../../src/server/classes/MatchChatAnnouncements"

const play = (handIdx: number, name: string, freshHand = true) => ({
  freshHand,
  handIdx,
  player: { name },
  roundIdx: 1,
})

const players = (enabled: number) =>
  Array.from({ length: 6 }, (_, idx) => ({
    abandoned: false,
    disabled: idx >= enabled,
  }))

describe("Match chat announcements", () => {
  it("announces the first playable turn only once per match", () => {
    const announcements = MatchChatAnnouncements()

    expect(announcements.getHandStartMessages(play(1, "Ana"), players(6))).to.deep.equal([
      "Es el turno de Ana",
    ])
    expect(announcements.getHandStartMessages(play(1, "Ana"), players(6))).to.deep.equal([])
    expect(announcements.getHandStartMessages(play(2, "Beto"), players(6))).to.deep.equal([])
    expect(announcements.getHandStartMessages(play(3, "Cata", false), players(6))).to.deep.equal([])
  })

  it("announces pica-pica once without repeating turn announcements", () => {
    const announcements = MatchChatAnnouncements()

    expect(announcements.getHandStartMessages(play(1, "Bot 1"), players(2))).to.deep.equal([
      "Empezo el Pica-Pica",
      "Es el turno de Bot 1",
    ])
    expect(announcements.getHandStartMessages(play(2, "Bot 2"), players(2))).to.deep.equal([])
    expect(announcements.getHandStartMessages(play(3, "Bot 3"), players(2))).to.deep.equal([])
  })

  it("still announces the first pica-pica mini-hand after the initial turn", () => {
    const announcements = MatchChatAnnouncements()

    expect(announcements.getHandStartMessages(play(1, "Ana"), players(6))).to.deep.equal([
      "Es el turno de Ana",
    ])
    expect(announcements.getHandStartMessages(play(2, "Bot 1"), players(2))).to.deep.equal([
      "Empezo el Pica-Pica",
    ])
    expect(announcements.getHandStartMessages(play(3, "Bot 2"), players(2))).to.deep.equal([])
  })

  it("does not announce pica-pica after any player abandons", () => {
    const announcements = MatchChatAnnouncements()
    const remainingPlayers = players(2)
    remainingPlayers[5].abandoned = true

    expect(announcements.getHandStartMessages(play(1, "Survivor"), remainingPlayers)).to.deep.equal(
      ["Es el turno de Survivor"]
    )
  })
})
