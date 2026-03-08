import type { CommandPayload } from "@minecraft/shared"
import type { Ec2Gateway } from "../aws/ec2"
import { createSsmCommand, type SsmGateway } from "../aws/ssm"

const formatOutput = (output: string): string => {
  const trimmed = output.trim()
  return trimmed.length > 0 ? `\n\`\`\`\n${trimmed.slice(0, 1500)}\n\`\`\`` : ""
}

export const handleGamemode = async (
  payload: Extract<CommandPayload, { commandName: "gamemode" }>,
  ec2: Ec2Gateway,
  ssm: SsmGateway,
  instanceId: string
): Promise<string> => {
  const instance = await ec2.describeInstance(instanceId)
  if (instance.state !== "running") {
    return `⚠️ EC2 が ${instance.state} のため gamemode を変更できません`
  }

  const command = `defaultgamemode ${payload.gameMode}`
  const output = await ssm.runCommand(instanceId, createSsmCommand("mc-command", [command]))
  return `✅ ゲームモードを ${payload.gameMode} に変更しました${formatOutput(output)}`
}
