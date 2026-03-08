import type { Ec2Gateway } from "../aws/ec2"
import { createSsmCommand, type SsmGateway } from "../aws/ssm"

const formatOutput = (output: string): string => {
  const trimmed = output.trim()
  return trimmed.length > 0 ? `\n\`\`\`\n${trimmed.slice(0, 1500)}\n\`\`\`` : ""
}

export const handleMorning = async (
  ec2: Ec2Gateway,
  ssm: SsmGateway,
  instanceId: string
): Promise<string> => {
  const instance = await ec2.describeInstance(instanceId)
  if (instance.state !== "running") {
    return `⚠️ EC2 が ${instance.state} のため時刻を変更できません`
  }

  const output = await ssm.runCommand(instanceId, createSsmCommand("mc-command", ["time set day"]))
  return `✅ 時刻を朝に変更しました${formatOutput(output)}`
}
