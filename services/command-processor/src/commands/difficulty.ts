import type { CommandPayload } from "@minecraft/shared"

import type { Ec2Gateway } from "../aws/ec2"
import { createSsmCommand, type SsmGateway } from "../aws/ssm"

const formatOutput = (output: string): string => {
  const trimmed = output.trim()
  return trimmed.length > 0 ? `\n\`\`\`\n${trimmed.slice(0, 1500)}\n\`\`\`` : ""
}

export const handleDifficulty = async (
  payload: Extract<CommandPayload, { commandName: "difficulty" }>,
  ec2: Ec2Gateway,
  ssm: SsmGateway,
  instanceId: string
): Promise<string> => {
  const instance = await ec2.describeInstance(instanceId)
  if (instance.state !== "running") {
    return `⚠️ EC2 が ${instance.state} のため難易度を変更できません`
  }

  const command = `difficulty ${payload.difficulty}`
  const output = await ssm.runCommand(instanceId, createSsmCommand("mc-command", [command]))
  return `✅ 難易度を ${payload.difficulty} に変更しました${formatOutput(output)}`
}
