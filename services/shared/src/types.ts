export type CommandName =
  | "start"
  | "stop"
  | "status"
  | "restore"
  | "cmd"
  | "whitelist"
  | "admin"
  | "gamemode"
  | "playtime"
export type WhitelistAction = "add" | "remove" | "list" | "on" | "off"
export type AdminAction = "grant" | "revoke"
export type GameMode = "survival" | "creative" | "adventure" | "spectator"
export type PlaytimeAction = "player" | "top"

type BaseCommandPayload = {
  applicationId: string
  interactionToken: string
  userId: string
}

export type CommandPayload =
  | (BaseCommandPayload & {
      commandName: "start" | "stop" | "status" | "restore"
    })
  | (BaseCommandPayload & {
      commandName: "cmd"
      commandArgument: string
    })
  | (BaseCommandPayload & {
      commandName: "whitelist"
      whitelistAction: WhitelistAction
      playerName?: string
    })
  | (BaseCommandPayload & {
      commandName: "admin"
      adminAction: AdminAction
      playerName: string
    })
  | (BaseCommandPayload & {
      commandName: "gamemode"
      gameMode: GameMode
    })
  | (BaseCommandPayload & {
      commandName: "playtime"
      playtimeAction: PlaytimeAction
      playerName?: string
    })
