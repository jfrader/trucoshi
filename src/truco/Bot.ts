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

interface BotPersonality {
  aggression: number // 0 to 1: How likely to play high cards or call Truco/Envido aggressively
  bluffing: number // 0 to 1: How likely to bluff with weak hands
  caution: number // 0 to 1: How likely to conserve high cards or reject risky bets
  envidoConfidence: number // 0 to 1: How confident in Envido calls
}

export const BOT_NAMES = [
  "Botillo",
  "Hal",
  "Sektor",
  "Cyrax",
  "Smoke",
  "Nick",
  "Adam",
  "Hodlbot",
  "Lambot",
  "Franbot",
  "Jack",
  "Bender",
] as const

export type BotProfile = (typeof BOT_NAMES)[number]

const PERSONALITY_PROFILES: Record<BotProfile, BotPersonality> = {
  Botillo: { aggression: 0.7, bluffing: 0.6, caution: 0.5, envidoConfidence: 0.5 },
  Hal: { aggression: 0.7, bluffing: 0.6, caution: 0.4, envidoConfidence: 0.6 },
  Sektor: { aggression: 0.6, bluffing: 0.4, caution: 0.5, envidoConfidence: 0.7 },
  Cyrax: { aggression: 0.8, bluffing: 0.7, caution: 0.3, envidoConfidence: 0.6 },
  Smoke: { aggression: 0.5, bluffing: 0.5, caution: 0.6, envidoConfidence: 0.5 },
  Nick: { aggression: 0.5, bluffing: 0.5, caution: 0.5, envidoConfidence: 0.5 },
  Adam: { aggression: 0.4, bluffing: 0.3, caution: 0.7, envidoConfidence: 0.4 },
  Hodlbot: { aggression: 0.3, bluffing: 0.2, caution: 0.8, envidoConfidence: 0.4 },
  Lambot: { aggression: 0.8, bluffing: 0.7, caution: 0.2, envidoConfidence: 0.6 },
  Franbot: { aggression: 0.4, bluffing: 0.6, caution: 0.5, envidoConfidence: 0.5 },
  Jack: { aggression: 0.7, bluffing: 0.1, caution: 0.5, envidoConfidence: 0.7 },
  Bender: { aggression: 0.9, bluffing: 0.8, caution: 0.5, envidoConfidence: 0.5 },
}

export async function playBot(
  table: ITable,
  bot: IPlayer,
  play: IPlayInstance,
  playCard: ITrucoshi["playCard"],
  sayCommand: ITrucoshi["sayCommand"]
) {
  if (!play.player || !bot.isTurn || play.player.idx !== bot.idx) return

  const profile = bot.bot ? PERSONALITY_PROFILES[bot.bot] : PERSONALITY_PROFILES["Nick"]
  const botHandStrength = bot.hand.reduce((sum, card) => sum + CARDS[card], 0)
  const isFirstRound = play.roundIdx === 1
  const isLastRound = play.roundIdx === 3
  const previousRoundTie = play.rounds?.[play.roundIdx - 2]?.tie
  const teamScore = play.teams[bot.teamIdx].points
  const opponentScore = play.teams[Number(!bot.teamIdx)].points
  const matchPoint = play.matchOptions.matchPoint || 15
  const isCloseToWin =
    teamScore.buenas >= matchPoint * 0.7 || opponentScore.buenas >= matchPoint * 0.7
  const currentRound = play.rounds?.[play.roundIdx - 1]

  // **Helper Functions**

  const getTeammates = () =>
    table.players.filter((p) => p.teamIdx === bot.teamIdx && p.idx !== bot.idx)

  const estimateOpponentStrength = () => {
    const opponentCards = table.players
      .filter((p) => p.teamIdx !== bot.teamIdx)
      .flatMap((p) => p.usedHand)
    const total = opponentCards.reduce((sum, card) => sum + CARDS[card], 0)
    const avg = opponentCards.length > 0 ? total / opponentCards.length : 7
    const adjustment = play.truco.state > 1 ? 1.5 : isLastRound ? 1.2 : 1
    return avg * adjustment
  }

  const estimateTeammateStrength = () => {
    const teammates = getTeammates()
    const teammateCards = teammates.flatMap((p) => [...p.hand, ...p.usedHand])
    const total = teammateCards.reduce((sum, card) => sum + CARDS[card], 0)
    const avg = teammateCards.length > 0 ? total / teammateCards.length : 7
    return avg * (isFirstRound ? 1.1 : 1)
  }

  const estimateTeamEnvido = () => {
    const teammates = getTeammates()
    const teammateEnvidoPoints = teammates.map((p) =>
      p.envido.reduce((max, e) => Math.max(max, e.value), 0)
    )
    const botEnvido = bot.getHighestEnvido()
    return Math.max(botEnvido, ...teammateEnvidoPoints, 20)
  }

  const shouldBluff = () => {
    const pressure = isCloseToWin ? 0.5 : 0.3
    const teamStrength =
      (botHandStrength + estimateTeammateStrength() * getTeammates().length) /
      (getTeammates().length + 1)
    const handRisk = teamStrength / 30
    return Math.random() < profile.bluffing * pressure * (1 - handRisk + 0.5)
  }

  const selectWeightedCard = (): [number, ICard] => {
    const weights = bot.hand.map((card) => 1 / (CARDS[card] + 1) ** (1 / profile.caution))
    const sum = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * sum
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i]
      if (r <= 0) return [i, bot.hand[i]]
    }
    return [0, bot.hand[0]]
  }

  const isRoundWinnable = () => {
    const opponentCards =
      currentRound?.cards?.filter((p) => p.player.teamIdx !== bot.teamIdx).map((p) => p.card) || []
    const teammateCards =
      currentRound?.cards
        ?.filter((p) => p.player.teamIdx === bot.teamIdx && p.player.idx !== bot.idx)
        .map((p) => p.card) || []
    const opponentBest = opponentCards.length ? Math.max(...opponentCards.map((c) => CARDS[c])) : 0
    const teammateBest = teammateCards.length ? Math.max(...teammateCards.map((c) => CARDS[c])) : 0
    const [_, highestCard] = bot.getHighestCard()
    const teammatesNotPlayed = getTeammates().filter(
      (p) => !currentRound?.cards?.some((c) => c.player.idx === p.idx)
    )
    const teammateBestInHand = teammatesNotPlayed.reduce(
      (max, p) => Math.max(max, ...p.hand.map((c) => CARDS[c])),
      0
    )
    return (
      teammateBest > opponentBest ||
      CARDS[highestCard] > opponentBest ||
      teammateBestInHand > opponentBest
    )
  }

  const isLastTeamPlayer = () => {
    const teamPlayers = table.players.filter((p) => p.teamIdx === bot.teamIdx)
    const positions = teamPlayers.map((p) => table.getPlayerPosition(p.key, true))
    const maxPosition = Math.max(...positions)
    const botPosition = table.getPlayerPosition(bot.key, true)
    return botPosition === maxPosition
  }

  const selectCard = (): [number, ICard] => {
    const opponentStrength = estimateOpponentStrength()
    const teammateStrength = estimateTeammateStrength()
    const [highestIdx, highestCard] = bot.getHighestCard()
    const [lowestIdx, lowestCard] = bot.getLowestCard()

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

    const opponentCards =
      currentRound?.cards?.filter((p) => p.player.teamIdx !== bot.teamIdx).map((p) => p.card) || []
    const teammateCards =
      currentRound?.cards
        ?.filter((p) => p.player.teamIdx === bot.teamIdx && p.player.idx !== bot.idx)
        .map((p) => p.card) || []
    const opponentBest = opponentCards.length ? Math.max(...opponentCards.map((c) => CARDS[c])) : 0
    const teammateBest = teammateCards.length ? Math.max(...teammateCards.map((c) => CARDS[c])) : 0

    const teammatesNotPlayed = teammates.filter(
      (p) => !currentRound?.cards?.some((c) => c.player.idx === p.idx)
    )

    // Teammate has already won or high caution near win
    if (
      (teammateBest > opponentBest && teammateBest > 0) ||
      (isCloseToWin && profile.caution > 0.7)
    ) {
      return [lowestIdx, lowestCard]
    }

    // Bot can't beat opponent's best card
    if (opponentBest > 0 && CARDS[highestCard] < opponentBest) {
      return [lowestIdx, lowestCard]
    }

    // First-round logic
    if (isFirstRound) {
      if (isRoundWinnable()) {
        const mediumIdx = bot.hand.findIndex((card) => CARDS[card] >= 5 && CARDS[card] <= 9)
        if (mediumIdx !== -1 && (opponentStrength < 8 || teammateStrength > 10)) {
          return [mediumIdx, bot.hand[mediumIdx]]
        }
      }
      if (profile.caution > 0.6 && CARDS[highestCard] > 10 && isCloseToWin) {
        return [lowestIdx, lowestCard]
      }
      return selectWeightedCard()
    }

    // Last round or tie logic
    if ((isLastRound || previousRoundTie) && isRoundWinnable()) {
      if (
        CARDS[highestCard] > opponentStrength * profile.aggression &&
        teammateStrength < 8 &&
        (!isCloseToWin || profile.aggression > 0.6)
      ) {
        return [highestIdx, highestCard]
      }
    }

    // High caution, unwinnable or near win
    if (profile.caution > 0.7 && CARDS[highestCard] > 10 && (!isRoundWinnable() || isCloseToWin)) {
      return [lowestIdx, lowestCard]
    }

    // Default case
    return teammateStrength > 10 ? selectWeightedCard() : [highestIdx, highestCard]
  }

  // **Flor Phase**
  if (play.state === EHandState.WAITING_FLOR_ANSWER) {
    if (play.flor.stake > 3 && bot.flor) {
      return sayCommand({
        command:
          bot.flor.value >= 35 * profile.envidoConfidence
            ? EAnswerCommand.QUIERO
            : EAnswerCommand.NO_QUIERO,
        play,
        player: bot,
        table: table.sessionId,
      })
    }
    if (
      bot._commands.has(EFlorCommand.CONTRAFLOR_AL_RESTO) &&
      bot.flor &&
      bot.flor?.value >= 37 * profile.envidoConfidence
    ) {
      return sayCommand({
        command: EFlorCommand.CONTRAFLOR_AL_RESTO,
        play,
        player: bot,
        table: table.sessionId,
      })
    }
    if (
      bot._commands.has(EFlorCommand.CONTRAFLOR) &&
      bot.flor &&
      bot.flor?.value >= 30 * profile.envidoConfidence
    ) {
      return sayCommand({
        command: EFlorCommand.CONTRAFLOR,
        play,
        player: bot,
        table: table.sessionId,
      })
    }
    if (
      bot._commands.has(EFlorCommand.ACHICO) &&
      bot.flor &&
      bot.flor?.value < 27 * profile.envidoConfidence
    ) {
      return sayCommand({ command: EFlorCommand.ACHICO, play, player: bot, table: table.sessionId })
    }
    return sayCommand({ command: EFlorCommand.FLOR, play, player: bot, table: table.sessionId })
  }

  if (bot._commands.has(EFlorCommand.FLOR)) {
    return sayCommand({ command: EFlorCommand.FLOR, play, player: bot, table: table.sessionId })
  }

  // **Play Phase**
  if (play.state === EHandState.WAITING_PLAY) {
    // General Truco escalation check
    const nextTrucoCommand = play.truco.getNextTrucoCommand()
    if (nextTrucoCommand && bot._commands.has(nextTrucoCommand)) {
      const trucoThresholds = {
        [ETrucoCommand.TRUCO]: isFirstRound ? 25 : 15,
        [ETrucoCommand.RE_TRUCO]: 20,
        [ETrucoCommand.VALE_CUATRO]: 25,
      }
      let requiredStrength = trucoThresholds[nextTrucoCommand] * (1 - profile.caution)
      if (isLastRound || previousRoundTie) {
        requiredStrength *= 0.8
      }
      const teamStrength = botHandStrength + estimateTeammateStrength() * getTeammates().length
      const bluffChance = isFirstRound ? profile.bluffing * 0.3 : profile.bluffing
      const shouldEscalate =
        (isLastTeamPlayer() || profile.aggression > 0.8) &&
        ((teamStrength > requiredStrength && profile.aggression > 0.5 && botHandStrength >= 10) ||
          Math.random() < bluffChance * (isCloseToWin ? 0.5 : 0.2) * (1 - teamStrength / 30 + 0.5))
      if (shouldEscalate) {
        return sayCommand({
          command: nextTrucoCommand,
          play,
          player: bot,
          table: table.sessionId,
        })
      }
    }

    // Envido logic (only in the first round)
    if (isFirstRound) {
      const teamEnvido = estimateTeamEnvido()
      const pointsToWin = matchPoint - Math.max(teamScore.buenas, opponentScore.buenas)
      const isLastTablePlayer = table.getPlayerPosition(bot.key, true) === table.players.length - 1
      const noEnvidoCalled = play.envido.stake === 0

      if (bot._commands.has(EEnvidoCommand.ENVIDO)) {
        // Fishing logic for last table player
        if (isLastTablePlayer && noEnvidoCalled && teamEnvido >= 15 * profile.envidoConfidence) {
          return sayCommand({
            command: EEnvidoCommand.ENVIDO,
            play,
            player: bot,
            table: table.sessionId,
          })
        }
        // Regular Envido logic for last team player
        if (isLastTeamPlayer()) {
          if (pointsToWin <= matchPoint * 0.3 && teamEnvido >= 30 * profile.envidoConfidence) {
            return sayCommand({
              command: EEnvidoCommand.FALTA_ENVIDO,
              play,
              player: bot,
              table: table.sessionId,
            })
          }
          if (
            teamEnvido >= 18 * profile.envidoConfidence &&
            (Math.random() > 0.5 * (1 - profile.aggression) || shouldBluff())
          ) {
            return sayCommand({
              command: EEnvidoCommand.ENVIDO,
              play,
              player: bot,
              table: table.sessionId,
            })
          }
          if (
            teamEnvido >= 33 * profile.envidoConfidence &&
            Math.random() > 0.7 * (1 - profile.aggression) * (1 - profile.bluffing)
          ) {
            return sayCommand({
              command: EEnvidoCommand.REAL_ENVIDO,
              play,
              player: bot,
              table: table.sessionId,
            })
          }
        }
      }
    }

    // Play a card if no command is called
    const [cardIdx, card] = selectCard()
    return playCard({ card, cardIdx, play, player: bot, table: table.sessionId })
  }

  // **Truco Answer**
  if (play.state === EHandState.WAITING_FOR_TRUCO_ANSWER) {
    const nextTrucoCommand = play.truco.getNextTrucoCommand()
    const teamStrength = botHandStrength + estimateTeammateStrength() * getTeammates().length

    if (nextTrucoCommand && bot._commands.has(nextTrucoCommand)) {
      const trucoThresholds = {
        [ETrucoCommand.TRUCO]: 15,
        [ETrucoCommand.RE_TRUCO]: 20,
        [ETrucoCommand.VALE_CUATRO]: 25,
      }
      const requiredStrength = trucoThresholds[nextTrucoCommand] * (1 - profile.caution)
      if ((teamStrength > requiredStrength && profile.aggression > 0.5) || shouldBluff()) {
        return sayCommand({
          command: nextTrucoCommand,
          play,
          player: bot,
          table: table.sessionId,
        })
      }
    }

    const threshold = isCloseToWin ? 19 : 21
    if (
      shouldBluff() ||
      teamStrength > threshold * (getTeammates().length + 1) * (1 - profile.caution)
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

  // **Envido Answer**
  if (play.state === EHandState.WAITING_ENVIDO_ANSWER) {
    const teamEnvido = estimateTeamEnvido()
    const possibleCommands = play.envido.possibleAnswerCommands.filter((cmd) =>
      bot._commands.has(cmd)
    )
    const pointsToWin = matchPoint - Math.max(teamScore.buenas, opponentScore.buenas)

    const envidoStakes: Record<EEnvidoCommand, number> = {
      [EEnvidoCommand.ENVIDO]: 2,
      [EEnvidoCommand.REAL_ENVIDO]: 3,
      [EEnvidoCommand.FALTA_ENVIDO]: pointsToWin,
    }

    const commandScores = possibleCommands.map((command) => {
      if (command === EAnswerCommand.QUIERO) {
        const threshold = isCloseToWin ? 24 : pointsToWin <= matchPoint * 0.3 ? 23 : 25
        return {
          command,
          score:
            teamEnvido >= threshold * profile.envidoConfidence
              ? 0.8 * profile.envidoConfidence
              : 0.4 * (1 - profile.caution),
        }
      }
      if (command === EAnswerCommand.NO_QUIERO) {
        const threshold = isCloseToWin ? 24 : pointsToWin <= matchPoint * 0.3 ? 23 : 25
        return {
          command,
          score: teamEnvido < threshold * profile.envidoConfidence ? 0.9 * profile.caution : 0.2,
        }
      }
      if (Object.values(EEnvidoCommand).includes(command as EEnvidoCommand)) {
        const stake = envidoStakes[command as EEnvidoCommand] || play.envido.stake
        const envidoThreshold = 25 + stake * 3 * (1 - profile.envidoConfidence)
        const bluffFactor = shouldBluff() ? 0.2 * profile.bluffing : 0
        const closeToWinFactor =
          isCloseToWin && stake >= matchPoint * 0.3 ? 0.2 * profile.aggression : 0
        return {
          command,
          score:
            teamEnvido >= envidoThreshold
              ? 0.7 * profile.aggression + bluffFactor + closeToWinFactor
              : 0.2 * profile.aggression + bluffFactor,
        }
      }
      return { command, score: 0 }
    })

    const bestCommand = commandScores.reduce(
      (best, curr) => (curr.score > best.score ? curr : best),
      commandScores[0] || { command: EAnswerCommand.NO_QUIERO, score: 0 }
    )

    return sayCommand({
      command: bestCommand.command,
      play,
      player: bot,
      table: table.sessionId,
    })
  }

  // **Envido Points**
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

    return sayCommand({
      command: highestEnvido,
      play,
      player: bot,
      table: table.sessionId,
    })
  }
}
