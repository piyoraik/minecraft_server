import type {
  AdminAction,
  CommandName,
  CommandPayload,
  Difficulty,
  GameMode,
  PlaytimeAction,
  WhitelistAction
} from "@minecraft/shared"

type DiscordOption = {
  name?: string
  value?: string
  options?: DiscordOption[]
}

type DiscordData = {
  name?: string
  options?: DiscordOption[]
  custom_id?: string
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
  "backup",
  "restore",
  "difficulty",
  "morning",
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

const isDifficulty = (value: string): value is Difficulty => {
  return ["peaceful", "easy", "normal", "hard"].includes(value)
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
  const customId = interaction.data?.custom_id
  if (typeof customId === "string") {
    const restoreConfirmPayload = buildRestoreConfirmPayload(
      interaction,
      applicationId,
      customId
    )
    if (restoreConfirmPayload !== null) {
      return restoreConfirmPayload
    }
  }

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

  if (commandName === "difficulty") {
    const difficulty = firstOption?.options?.[0]?.name
    if (typeof difficulty !== "string" || !isDifficulty(difficulty)) {
      throw new Error("Missing difficulty")
    }

    return {
      commandName,
      difficulty,
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

const RESTORE_CONFIRM_PREFIX = "restore:confirm:"
const RESTORE_CANCEL_PREFIX = "restore:cancel:"
const RESTORE_CONFIRM_TTL_MS = 15 * 60 * 1000

const getUserId = (interaction: DiscordInteraction): string => {
  const userId = interaction.member?.user?.id ?? interaction.user?.id
  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error("Missing user id")
  }

  return userId
}

const buildRestoreConfirmPayload = (
  interaction: DiscordInteraction,
  applicationId: string,
  customId: string
): CommandPayload | null => {
  if (!customId.startsWith(RESTORE_CONFIRM_PREFIX)) {
    return null
  }

  const timestampText = customId.slice(RESTORE_CONFIRM_PREFIX.length)
  const timestamp = Number.parseInt(timestampText, 10)
  if (!Number.isFinite(timestamp)) {
    throw new Error("Invalid restore confirmation")
  }

  if (Date.now() - timestamp > RESTORE_CONFIRM_TTL_MS) {
    throw new Error("Restore confirmation expired")
  }

  const interactionToken = interaction.token
  if (typeof interactionToken !== "string" || interactionToken.length === 0) {
    throw new Error("Missing interaction token")
  }

  return {
    commandName: "restore",
    applicationId,
    interactionToken,
    userId: getUserId(interaction)
  }
}

export const isRestoreCancelInteraction = (interaction: DiscordInteraction): boolean => {
  return typeof interaction.data?.custom_id === "string" &&
    interaction.data.custom_id.startsWith(RESTORE_CANCEL_PREFIX)
}

export const isRestoreConfirmInteraction = (interaction: DiscordInteraction): boolean => {
  return typeof interaction.data?.custom_id === "string" &&
    interaction.data.custom_id.startsWith(RESTORE_CONFIRM_PREFIX)
}

export const createRestoreConfirmationResponse = (): {
  type: 4
  data: {
    flags: number
    content: string
    components: Array<{
      type: 1
      components: Array<{
        type: 2
        style: number
        label: string
        custom_id: string
      }>
    }>
  }
} => {
  const timestamp = Date.now()

  return {
    type: 4,
    data: {
      flags: 64,
      content: "latest backup を restore します。現在の serverfiles は上書きされます。実行してよいですか？",
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 4,
              label: "Restore を実行",
              custom_id: `${RESTORE_CONFIRM_PREFIX}${timestamp}`
            },
            {
              type: 2,
              style: 2,
              label: "キャンセル",
              custom_id: `${RESTORE_CANCEL_PREFIX}${timestamp}`
            }
          ]
        }
      ]
    }
  }
}

export const createRestoreCanceledResponse = (): {
  type: 7
  data: { content: string; components: [] }
} => {
  return {
    type: 7,
    data: {
      content: "restore をキャンセルしました。",
      components: []
    }
  }
}

export const createRestoreStartedResponse = (): {
  type: 7
  data: { content: string; components: [] }
} => {
  return {
    type: 7,
    data: {
      content: "restore を開始しました。完了したら follow-up で結果を返します。",
      components: []
    }
  }
}
