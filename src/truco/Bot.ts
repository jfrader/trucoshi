import {
  CARDS,
  EAnswerCommand,
  EEnvidoAnswerCommand,
  EEnvidoCommand,
  EFlorCommand,
  EHandState,
  ETrucoCommand,
  ICard,
  IPlayer,
  ITable,
} from ".."
import { ITrucoshi } from "../server"
import { IPlayInstance } from "./Play"

export async function playBot(
  table: ITable,
  bot: IPlayer,
  play: IPlayInstance,
  playCard: ITrucoshi["playCard"],
  sayCommand: ITrucoshi["sayCommand"]
) {
  if (!play.player || !bot.isTurn || play.player.idx !== bot.idx) return

  const botHandStrength = bot.hand.reduce((sum, card) => sum + CARDS[card], 0)
  const isFirstRound = play.roundIdx === 1
  const isLastRound = play.roundIdx === 3
  const previousRoundTie = play.rounds?.[play.roundIdx - 2]?.tie
  const teamScore = play.teams[bot.teamIdx].points
  const opponentScore = play.teams[Number(!bot.teamIdx)].points
  const isCloseToWin = teamScore.buenas >= 5 || opponentScore.buenas >= 5
  const currentRound = play.rounds?.[play.roundIdx - 1]

  // Helper to get teammates
  const getTeammates = () =>
    table.players.filter((p) => p.teamIdx === bot.teamIdx && p.idx !== bot.idx)

  // Helper to estimate opponent's hand strength based on played cards
  const estimateOpponentStrength = () => {
    const opponentCards = table.players
      .filter((p) => p.teamIdx !== bot.teamIdx)
      .flatMap((p) => p.usedHand)
    const total = opponentCards.reduce((sum, card) => sum + CARDS[card], 0)
    return opponentCards.length > 0 ? total / opponentCards.length : 7
  }

  // Helper to estimate teammates' hand strength based on current hand and played cards
  const estimateTeammateStrength = () => {
    const teammates = getTeammates()
    const teammateCards = teammates.flatMap((p) => [...p.hand, ...p.usedHand])
    const total = teammateCards.reduce((sum, card) => sum + CARDS[card], 0)
    return teammateCards.length > 0 ? total / teammateCards.length : 7
  }

  // Helper to estimate team's highest Envido points
  const estimateTeamEnvido = () => {
    const teammates = getTeammates()
    const teammateEnvidoPoints = teammates.map((p) => {
      return p.envido.reduce((max, e) => Math.max(max, e.value), 0)
    })
    const botEnvido = bot.getHighestEnvido()
    return Math.max(botEnvido, ...teammateEnvidoPoints, 20)
  }

  // Helper to decide if bot should bluff
  const shouldBluff = () => {
    const pressure = isCloseToWin ? 0.4 : 0.2
    const teamStrength =
      (botHandStrength + estimateTeammateStrength() * getTeammates().length) /
      (getTeammates().length + 1)
    const handRisk = teamStrength / 30
    return Math.random() < pressure * (1 - handRisk + 0.5)
  }

  // Helper to select a weighted card (prefers lower cards)
  const selectWeightedCard = (): [number, ICard] => {
    const weights = bot.hand.map((card) => 1 / (CARDS[card] + 1))
    const sum = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * sum
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i]
      if (r <= 0) return [i, bot.hand[i]]
    }
    return [0, bot.hand[0]]
  }

  // Helper to select a card based on round, opponent, and teammate context
  const selectCard = (): [number, ICard] => {
    const opponentStrength = estimateOpponentStrength()
    const teammateStrength = estimateTeammateStrength()
    const [highestIdx, highestCard] = bot.getHighestCard()

    // Get team's highest possible card (bot + teammates' hands + played cards)
    const teammates = getTeammates()
    const teamCards = [
      ...bot.hand,
      ...teammates.flatMap((p) => p.hand),
      ...(currentRound?.cards?.filter((p) => p.player.teamIdx === bot.teamIdx).map((p) => p.card) ||
        []),
    ]
    const teamHighestCard = teamCards.reduce(
      (maxCard, card) => (CARDS[card] > CARDS[maxCard] ? card : maxCard),
      teamCards[0] || bot.hand[0]
    )

    // Check current round's cards
    const opponentCards =
      currentRound?.cards?.filter((p) => p.player.teamIdx !== bot.teamIdx).map((p) => p.card) || []
    const teammateCards =
      currentRound?.cards
        ?.filter((p) => p.player.teamIdx === bot.teamIdx && p.player.idx !== bot.idx)
        .map((p) => p.card) || []
    const opponentBest = opponentCards.length ? Math.max(...opponentCards.map((c) => CARDS[c])) : 0
    const teammateBest = teammateCards.length ? Math.max(...teammateCards.map((c) => CARDS[c])) : 0

    // Play lowest card if teammate has won the round (teammate's card is highest)
    if (teammateCards.length > 0 && teammateBest > opponentBest) {
      const lowestIdx = bot.hand.reduce(
        (min, card, idx) => (CARDS[card] < CARDS[bot.hand[min]] ? idx : min),
        0
      )
      return [lowestIdx, bot.hand[lowestIdx]]
    }

    // Play lowest card if round is lost (opponent's best card can't be beaten by team)
    const teammatesNotPlayed = teammates.filter(
      (p) => !currentRound?.cards?.some((c) => c.player.idx === p.idx)
    )
    const teammateBestInHand = teammatesNotPlayed.reduce(
      (max, p) => Math.max(max, ...p.hand.map((c) => CARDS[c])),
      0
    )
    if (
      opponentBest > 0 &&
      CARDS[teamHighestCard] < opponentBest &&
      (teammateBestInHand < opponentBest || teammatesNotPlayed.length === 0)
    ) {
      const lowestIdx = bot.hand.reduce(
        (min, card, idx) => (CARDS[card] < CARDS[bot.hand[min]] ? idx : min),
        0
      )
      return [lowestIdx, bot.hand[lowestIdx]]
    }

    // Play lowest card if a teammate has a better card in hand and hasn't played yet
    if (teammateBestInHand > CARDS[highestCard] && teammateBestInHand > opponentBest) {
      const lowestIdx = bot.hand.reduce(
        (min, card, idx) => (CARDS[card] < CARDS[bot.hand[min]] ? idx : min),
        0
      )
      return [lowestIdx, bot.hand[lowestIdx]]
    }

    // Play lowest card if team’s highest card can’t win
    if (opponentBest > 0 && CARDS[teamHighestCard] < opponentBest) {
      const lowestIdx = bot.hand.reduce(
        (min, card, idx) => (CARDS[card] < CARDS[bot.hand[min]] ? idx : min),
        0
      )
      return [lowestIdx, bot.hand[lowestIdx]]
    }

    // First round: Prefer medium card if teammates have strong cards
    if (isFirstRound) {
      const mediumIdx = bot.hand.findIndex((card) => CARDS[card] >= 5 && CARDS[card] <= 9)
      if (mediumIdx !== -1 && (opponentStrength < 8 || teammateStrength > 10)) {
        return [mediumIdx, bot.hand[mediumIdx]]
      }
      return selectWeightedCard()
    }

    // Critical rounds: Play high card if team needs it and bot’s card can win
    if (isLastRound || previousRoundTie) {
      if (CARDS[highestCard] > opponentStrength + 2 && teammateStrength < 8) {
        return [highestIdx, highestCard]
      }
    }

    // Default: Weighted card if teammates are strong, else play high card
    return teammateStrength > 10 ? selectWeightedCard() : [highestIdx, highestCard]
  }

  // -- FLOR PHASE --
  if (play.state === EHandState.WAITING_FLOR_ANSWER) {
    if (play.flor.stake > 3 && bot.flor) {
      return sayCommand({
        command: bot.flor.value >= 35 ? EAnswerCommand.QUIERO : EAnswerCommand.NO_QUIERO,
        play,
        player: bot,
        table: table.sessionId,
      })
    }
    if (bot._commands.has(EFlorCommand.CONTRAFLOR_AL_RESTO) && bot.flor && bot.flor?.value >= 37) {
      return sayCommand({
        command: EFlorCommand.CONTRAFLOR_AL_RESTO,
        play,
        player: bot,
        table: table.sessionId,
      })
    }
    if (bot._commands.has(EFlorCommand.CONTRAFLOR) && bot.flor && bot.flor?.value >= 30) {
      return sayCommand({
        command: EFlorCommand.CONTRAFLOR,
        play,
        player: bot,
        table: table.sessionId,
      })
    }
    if (bot._commands.has(EFlorCommand.ACHICO) && bot.flor && bot.flor?.value < 27) {
      return sayCommand({ command: EFlorCommand.ACHICO, play, player: bot, table: table.sessionId })
    }
    return sayCommand({ command: EFlorCommand.FLOR, play, player: bot, table: table.sessionId })
  }

  if (bot._commands.has(EFlorCommand.FLOR)) {
    return sayCommand({ command: EFlorCommand.FLOR, play, player: bot, table: table.sessionId })
  }

  // -- PLAY PHASE --
  if (play.state === EHandState.WAITING_PLAY) {
    if (isFirstRound) {
      const teamEnvido = estimateTeamEnvido()
      if (bot._commands.has(EEnvidoCommand.ENVIDO) && teamEnvido >= 20) {
        if (isCloseToWin && teamEnvido >= 30) {
          return sayCommand({
            command: EEnvidoCommand.FALTA_ENVIDO,
            play,
            player: bot,
            table: table.sessionId,
          })
        }
        if (teamEnvido >= 27 && Math.random() > 0.3) {
          return sayCommand({
            command: EEnvidoCommand.REAL_ENVIDO,
            play,
            player: bot,
            table: table.sessionId,
          })
        }
        if (teamEnvido >= 23) {
          return sayCommand({
            command: EEnvidoCommand.ENVIDO,
            play,
            player: bot,
            table: table.sessionId,
          })
        }
      }

      const teamStrength = botHandStrength + estimateTeammateStrength() * getTeammates().length
      if (
        bot._commands.has(ETrucoCommand.TRUCO) &&
        (teamStrength > 25 * (getTeammates().length + 1) || shouldBluff())
      ) {
        return sayCommand({
          command: ETrucoCommand.TRUCO,
          play,
          player: bot,
          table: table.sessionId,
        })
      }

      const [cardIdx, card] = selectCard()
      return playCard({ card, cardIdx, play, player: bot, table: table.sessionId })
    }

    if (isLastRound || previousRoundTie) {
      const [, highestCard] = bot.getHighestCard()
      const teamStrength = estimateTeammateStrength()
      if (
        CARDS[highestCard] > 10 &&
        play.truco.state < 4 &&
        bot._commands.has(ETrucoCommand.TRUCO) &&
        teamStrength < 8
      ) {
        return sayCommand({
          command: ETrucoCommand.TRUCO,
          play,
          player: bot,
          table: table.sessionId,
        })
      }
      const [cardIdx, card] = selectCard()
      return playCard({ card, cardIdx, play, player: bot, table: table.sessionId })
    }

    const [cardIdx, card] = selectCard()
    return playCard({ card, cardIdx, play, player: bot, table: table.sessionId })
  }

  // -- TRUCO ANSWER --
  if (play.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
    const teamStrength = botHandStrength + estimateTeammateStrength() * getTeammates().length
    if (
      Math.random() < 0.05 ||
      teamStrength > 21 * (getTeammates().length + 1) ||
      (isCloseToWin && teamStrength > 19 * (getTeammates().length + 1))
    ) {
      return sayCommand({
        command: EAnswerCommand.QUIERO,
        play,
        player: bot,
        table: table.sessionId,
      })
    }
    return sayCommand({
      command: EAnswerCommand.NO_QUIERO,
      play,
      player: bot,
      table: table.sessionId,
    })
  }

  // -- ENVIDO ANSWER --
  if (play.state === EHandState.WAITING_ENVIDO_ANSWER) {
    const teamEnvido = estimateTeamEnvido()
    if (
      (play.envido.stake > 4 && teamEnvido >= 29) ||
      (play.envido.stake >= 3 && teamEnvido >= 27) ||
      teamEnvido >= 24
    ) {
      return sayCommand({
        command: EAnswerCommand.QUIERO,
        play,
        player: bot,
        table: table.sessionId,
      })
    }
    return sayCommand({
      command: EAnswerCommand.NO_QUIERO,
      play,
      player: bot,
      table: table.sessionId,
    })
  }

  // -- ENVIDO POINTS --
  if (play.state === EHandState.WAITING_ENVIDO_POINTS_ANSWER) {
    const highestEnvido = bot.getHighestEnvido()
    const opponentIsWinner = play.envido.winningPlayer?.teamIdx !== bot.teamIdx
    const opponentWins = play.envido.winningPointsAnswer > highestEnvido
    const botPos = table.getPlayerPosition(bot.key, true)
    const winnerPos = play.envido.winningPlayer
      ? table.getPlayerPosition(play.envido.winningPlayer.key, true)
      : 999
    const forehandWins = botPos < winnerPos

    if (
      bot._commands.has(EEnvidoAnswerCommand.SON_BUENAS) &&
      opponentIsWinner &&
      (opponentWins || !forehandWins)
    ) {
      return sayCommand({
        command: EEnvidoAnswerCommand.SON_BUENAS,
        play,
        player: bot,
        table: table.sessionId,
      })
    }

    return sayCommand({ command: highestEnvido, play, player: bot, table: table.sessionId })
  }
}
