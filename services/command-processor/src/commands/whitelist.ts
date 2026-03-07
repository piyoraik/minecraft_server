import type { CommandPayload } from "../../../shared/src/types"
import type { Ec2Gateway } from "../aws/ec2"
import { createSsmCommand, type SsmGateway } from "../aws/ssm"

const PLAYER_NAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/

const formatOutput = (output: string): string => {
  const trimmed = output.trim()
  return trimmed.length > 0 ? `\n\`\`\`\n${trimmed.slice(0, 1500)}\n\`\`\`` : ""
}

const buildWhitelistCommand = (
  payload: Extract<CommandPayload, { commandName: "whitelist" }>
): string => {
  switch (payload.whitelistAction) {
    case "on":
    case "off":
    case "list":
      return `whitelist ${payload.whitelistAction}`
    case "add":
      if (!payload.playerName || !PLAYER_NAME_PATTERN.test(payload.playerName)) {
        throw new Error("Invalid player name")
      }
      return `whitelist add ${payload.playerName}`
    case "remove":
      if (!payload.playerName || !PLAYER_NAME_PATTERN.test(payload.playerName)) {
        throw new Error("Invalid player name")
      }
      return `whitelist remove ${payload.playerName}`
  }
}

export const handleWhitelist = async (
  payload: Extract<CommandPayload, { commandName: "whitelist" }>,
  ec2: Ec2Gateway,
  ssm: SsmGateway,
  instanceId: string
): Promise<string> => {
  const instance = await ec2.describeInstance(instanceId)
  if (instance.state !== "running") {
    return `⚠️ EC2 が ${instance.state} のため whitelist を操作できません`
  }

  const command = buildWhitelistCommand(payload)
  const output = await ssm.runCommand(instanceId, createSsmCommand("mc-command", [command]))
  return `✅ whitelist ${payload.whitelistAction} を実行しました${formatOutput(output)}`
}
