import type { CommandPayload } from "../../shared/src/types"
import { readRequiredEnv } from "../../shared/src"

import { createEc2Gateway, type Ec2Gateway } from "./aws/ec2"
import { createPlayerStatsGateway, type PlayerStatsGateway } from "./aws/player-stats"
import { createSsmGateway, type SsmGateway } from "./aws/ssm"
import { handleStart } from "./commands/start"
import { handleAdmin } from "./commands/admin"
import { handleCmd } from "./commands/cmd"
import { handleGamemode } from "./commands/gamemode"
import { handlePlaytime } from "./commands/playtime"
import { handleStatus } from "./commands/status"
import { handleStop } from "./commands/stop"
import { handleWhitelist } from "./commands/whitelist"
import { createFollowupGateway, type FollowupGateway } from "./discord/followup"

type ProcessorDeps = {
  ec2: Ec2Gateway
  ssm: SsmGateway
  playerStats: PlayerStatsGateway
  followup: FollowupGateway
}

const asUnknownRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== "object" || value === null) {
    return null
  }

  return value as Record<string, unknown>
}

const isCommandPayload = (value: unknown): value is CommandPayload => {
  const payload = asUnknownRecord(value)
  if (payload === null) {
    return false
  }

  const commandName = payload.commandName
  const isCommandNameValid =
    commandName === "start" ||
    commandName === "stop" ||
    commandName === "status" ||
    commandName === "cmd" ||
    commandName === "whitelist" ||
    commandName === "admin" ||
    commandName === "gamemode" ||
    commandName === "playtime"

  return (
    isCommandNameValid &&
    typeof payload.applicationId === "string" &&
    payload.applicationId.length > 0 &&
    typeof payload.interactionToken === "string" &&
    payload.interactionToken.length > 0 &&
    typeof payload.userId === "string" &&
    payload.userId.length > 0 &&
    (commandName !== "cmd" ||
      (typeof payload.commandArgument === "string" && payload.commandArgument.trim().length > 0)) &&
    (commandName !== "whitelist" ||
      (payload.whitelistAction === "list" ||
        payload.whitelistAction === "on" ||
        payload.whitelistAction === "off" ||
        typeof payload.playerName === "string")) &&
    (commandName !== "admin" ||
      (typeof payload.adminAction === "string" &&
        typeof payload.playerName === "string" &&
        payload.playerName.trim().length > 0)) &&
    (commandName !== "gamemode" ||
      (payload.gameMode === "survival" ||
        payload.gameMode === "creative" ||
        payload.gameMode === "adventure" ||
        payload.gameMode === "spectator")) &&
    (commandName !== "playtime" ||
      (payload.playtimeAction === "top" ||
        (payload.playtimeAction === "player" &&
          typeof payload.playerName === "string" &&
          payload.playerName.trim().length > 0)))
  )
}

export const processCommand = async (
  payload: CommandPayload,
  deps: ProcessorDeps,
  projectTagValue: string
): Promise<void> => {
  try {
    let content: string

    switch (payload.commandName) {
      case "playtime": {
        content = await handlePlaytime(payload, deps.playerStats)
        break
      }
      case "start": {
        const instance = await deps.ec2.findInstanceByProjectTag(projectTagValue)
        const instanceId = instance.instanceId
        content = await handleStart(deps.ec2, deps.ssm, instanceId)
        break
      }
      case "stop": {
        const instance = await deps.ec2.findInstanceByProjectTag(projectTagValue)
        const instanceId = instance.instanceId
        content = await handleStop(deps.ec2, deps.ssm, deps.playerStats, instanceId)
        break
      }
      case "status": {
        const instance = await deps.ec2.findInstanceByProjectTag(projectTagValue)
        const instanceId = instance.instanceId
        content = await handleStatus(deps.ec2, deps.ssm, instanceId)
        break
      }
      case "cmd": {
        const instance = await deps.ec2.findInstanceByProjectTag(projectTagValue)
        const instanceId = instance.instanceId
        content = await handleCmd(payload, deps.ec2, deps.ssm, instanceId)
        break
      }
      case "whitelist": {
        const instance = await deps.ec2.findInstanceByProjectTag(projectTagValue)
        const instanceId = instance.instanceId
        content = await handleWhitelist(payload, deps.ec2, deps.ssm, instanceId)
        break
      }
      case "admin": {
        const instance = await deps.ec2.findInstanceByProjectTag(projectTagValue)
        const instanceId = instance.instanceId
        content = await handleAdmin(payload, deps.ec2, deps.ssm, instanceId)
        break
      }
      case "gamemode": {
        const instance = await deps.ec2.findInstanceByProjectTag(projectTagValue)
        const instanceId = instance.instanceId
        content = await handleGamemode(payload, deps.ec2, deps.ssm, instanceId)
        break
      }
    }

    await deps.followup.send(payload.applicationId, payload.interactionToken, content)
  } catch (error) {
    console.error("command-processor failed", {
      error,
      command: payload.commandName,
      userId: payload.userId
    })

    await deps.followup.send(
      payload.applicationId,
      payload.interactionToken,
      "⚠️ コマンド処理中にエラーが発生しました"
    )
    throw error
  }
}

/**
 * 非同期実行されたイベントの検証と依存解決をここで終わらせ、後続ロジックを型安全な入力だけに限定する。
 * Lambda の外部境界を一本化し、各コマンド実装へ AWS 固有の初期化を漏らさないための入口。
 */
export const handler = async (event: unknown): Promise<void> => {
  if (!isCommandPayload(event)) {
    throw new Error("Invalid command payload")
  }

  const env = readRequiredEnv([
    "EC2_PROJECT_TAG_VALUE",
    "PLAYER_STATS_TABLE_NAME"
  ] as const)

  const deps: ProcessorDeps = {
    ec2: createEc2Gateway(),
    ssm: createSsmGateway(),
    playerStats: createPlayerStatsGateway(env.PLAYER_STATS_TABLE_NAME),
    followup: createFollowupGateway()
  }

  await processCommand(event, deps, env.EC2_PROJECT_TAG_VALUE)
}
