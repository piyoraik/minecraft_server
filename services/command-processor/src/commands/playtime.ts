import type { CommandPayload } from "@minecraft/shared"

import type { PlayerStatsGateway, PlayerStatsRecord } from "../aws/player-stats"

const formatDuration = (seconds: number): string => {
  const normalized = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(normalized / 3600)
  const minutes = Math.floor((normalized % 3600) / 60)
  const remainingSeconds = normalized % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`
  }

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`
  }

  return `${remainingSeconds}s`
}

const getLiveSessionSeconds = (record: PlayerStatsRecord): number => {
  if (!record.online || record.currentSessionStartedAt === null) {
    return 0
  }

  return Math.max(0, Math.floor(Date.now() / 1000) - Math.floor(record.currentSessionStartedAt / 1000))
}

const getEffectiveTotalSeconds = (record: PlayerStatsRecord): number => {
  return record.totalPlaySeconds + getLiveSessionSeconds(record)
}

export const handlePlaytime = async (
  payload: Extract<CommandPayload, { commandName: "playtime" }>,
  stats: PlayerStatsGateway
): Promise<string> => {
  if (payload.playtimeAction === "player") {
    const playerName = payload.playerName
    if (typeof playerName !== "string" || playerName.length === 0) {
      throw new Error("Missing player name")
    }

    const record = await stats.get(playerName)
    if (record === null) {
      return `ℹ️ \`${playerName}\` のプレイ履歴はまだありません`
    }

    const sessionSeconds = getLiveSessionSeconds(record)
    const totalSeconds = getEffectiveTotalSeconds(record)

    return [
      `プレイヤー: \`${record.playerName}\``,
      `累計プレイ時間: \`${formatDuration(totalSeconds)}\``,
      `ログイン回数: \`${record.joinCount}\``,
      `現在の状態: \`${record.online ? "online" : "offline"}\``,
      `現在のセッション: \`${formatDuration(sessionSeconds)}\``
    ].join("\n")
  }

  const records = await stats.listTop(10)
  if (records.length === 0) {
    return "ℹ️ まだプレイ履歴はありません"
  }

  const lines = records.map((record, index) => {
    return `${index + 1}. ${record.playerName} - ${formatDuration(getEffectiveTotalSeconds(record))}`
  })

  return `プレイ時間ランキング\n\`\`\`\n${lines.join("\n")}\n\`\`\``
}
