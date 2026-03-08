import type { CommandPayload } from "@minecraft/shared"
import type { Ec2Gateway } from "../aws/ec2"
import { createSsmCommand, type SsmGateway } from "../aws/ssm"

const PLAYER_NAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/

const formatOutput = (output: string): string => {
  const trimmed = output.trim()
  return trimmed.length > 0 ? `\n\`\`\`\n${trimmed.slice(0, 1500)}\n\`\`\`` : ""
}

const buildAdminCommand = (payload: Extract<CommandPayload, { commandName: "admin" }>): string => {
  if (!PLAYER_NAME_PATTERN.test(payload.playerName)) {
    throw new Error("Invalid player name")
  }

  switch (payload.adminAction) {
    case "grant":
      return `op ${payload.playerName}`
    case "revoke":
      return `deop ${payload.playerName}`
  }
}

export const handleAdmin = async (
  payload: Extract<CommandPayload, { commandName: "admin" }>,
  ec2: Ec2Gateway,
  ssm: SsmGateway,
  instanceId: string
): Promise<string> => {
  const instance = await ec2.describeInstance(instanceId)
  if (instance.state !== "running") {
    return `⚠️ EC2 が ${instance.state} のため admin を操作できません`
  }

  const command = buildAdminCommand(payload)
  const output = await ssm.runCommand(instanceId, createSsmCommand("mc-command", [command]))
  return `✅ admin ${payload.adminAction} を実行しました${formatOutput(output)}`
}
