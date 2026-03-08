import type {
  AdminAction,
  CommandName,
  CommandPayload,
  GameMode,
  PlaytimeAction,
  WhitelistAction
} from "../../shared/src/types"

type DiscordOption = {
  name?: string
  value?: string
  options?: DiscordOption[]
}

type DiscordData = {
  name?: string
  options?: DiscordOption[]
}

type DiscordUser = {
  id?: string
}

type DiscordMember = {
  user?: DiscordUser
}

type DiscordInteraction = {
  token?: string
  member?: DiscordMember
  user?: DiscordUser
  data?: DiscordData
}

const SUPPORTED_COMMANDS: readonly CommandName[] = [
  "start",
  "stop",
  "status",
  "cmd",
  "whitelist",
  "admin",
  "gamemode",
  "playtime"
]

const isWhitelistAction = (value: string): value is WhitelistAction => {
  return ["add", "remove", "list", "on", "off"].includes(value)
}

const isAdminAction = (value: string): value is AdminAction => {
  return ["grant", "revoke"].includes(value)
}

const isGameMode = (value: string): value is GameMode => {
  return ["survival", "creative", "adventure", "spectator"].includes(value)
}

const isPlaytimeAction = (value: string): value is PlaytimeAction => {
  return ["player", "top"].includes(value)
}

const isCommandName = (value: string): value is CommandName => {
  return SUPPORTED_COMMANDS.some((commandName) => commandName === value)
}

/**
 * Discord 側のコマンド表現差分をここで吸収し、以降の処理が単一のコマンド名だけを見れば済むようにする。
 * `/mc status` と `/status` の両方を許容するため、root と first option の両方を確認する。
 */
export const parseCommandName = (interaction: DiscordInteraction): CommandName | null => {
  const rootName = interaction.data?.name
  const firstOption = interaction.data?.options?.[0]
  const subCommand = firstOption?.name

  if (typeof subCommand === "string" && isCommandName(subCommand)) {
    return subCommand
  }

  if (typeof rootName === "string" && isCommandName(rootName)) {
    return rootName
  }

  return null
}

/**
 * Discord 固有の入れ子構造をこの段階で剥がし、後続処理をアプリ側の型に閉じ込める。
 * ルータ以降で Discord SDK 依存の分岐を増やさないための正規化ポイント。
 */
export const buildPayload = (
  interaction: DiscordInteraction,
  applicationId: string
): CommandPayload => {
  const commandName = parseCommandName(interaction)
  if (commandName === null) {
    throw new Error("Unsupported command")
  }

  const interactionToken = interaction.token
  if (typeof interactionToken !== "string" || interactionToken.length === 0) {
    throw new Error("Missing interaction token")
  }

  const userId = interaction.member?.user?.id ?? interaction.user?.id
  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error("Missing user id")
  }

  const firstOption = interaction.data?.options?.[0]

  if (commandName === "cmd") {
    const commandArgument = firstOption?.options?.[0]?.value
    if (typeof commandArgument !== "string" || commandArgument.trim().length === 0) {
      throw new Error("Missing command argument")
    }

    return {
      commandName,
      commandArgument: commandArgument.trim(),
      applicationId,
      interactionToken,
      userId
    }
  }

  if (commandName === "whitelist") {
    const action = firstOption?.options?.[0]?.name
    if (typeof action !== "string" || !isWhitelistAction(action)) {
      throw new Error("Missing whitelist action")
    }

    const playerName = firstOption?.options?.[0]?.options?.[0]?.value
    if ((action === "add" || action === "remove") && (typeof playerName !== "string" || playerName.trim().length === 0)) {
      throw new Error("Missing player name")
    }

    const payload: CommandPayload = {
      commandName,
      whitelistAction: action,
      applicationId,
      interactionToken,
      userId
    }

    if (typeof playerName === "string") {
      payload.playerName = playerName.trim()
    }

    return payload
  }

  if (commandName === "admin") {
    const action = firstOption?.options?.[0]?.name
    if (typeof action !== "string" || !isAdminAction(action)) {
      throw new Error("Missing admin action")
    }

    const playerName = firstOption?.options?.[0]?.options?.[0]?.value
    if (typeof playerName !== "string" || playerName.trim().length === 0) {
      throw new Error("Missing player name")
    }

    return {
      commandName,
      adminAction: action,
      playerName: playerName.trim(),
      applicationId,
      interactionToken,
      userId
    }
  }

  if (commandName === "gamemode") {
    const gameMode = firstOption?.options?.[0]?.name
    if (typeof gameMode !== "string" || !isGameMode(gameMode)) {
      throw new Error("Missing gamemode")
    }

    return {
      commandName,
      gameMode,
      applicationId,
      interactionToken,
      userId
    }
  }

  if (commandName === "playtime") {
    const action = firstOption?.options?.[0]?.name
    if (typeof action !== "string" || !isPlaytimeAction(action)) {
      throw new Error("Missing playtime action")
    }

    const playerName = firstOption?.options?.[0]?.options?.[0]?.value
    if (action === "player" && (typeof playerName !== "string" || playerName.trim().length === 0)) {
      throw new Error("Missing player name")
    }

    const payload: CommandPayload = {
      commandName,
      playtimeAction: action,
      applicationId,
      interactionToken,
      userId
    }

    if (typeof playerName === "string") {
      payload.playerName = playerName.trim()
    }

    return payload
  }

  return {
    commandName,
    applicationId,
    interactionToken,
    userId
  }
}
