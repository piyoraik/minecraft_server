import type { Ec2Gateway } from "../aws/ec2"
import { createSsmCommand, type SsmGateway } from "../aws/ssm"

const formatOutput = (output: string): string => {
  const trimmed = output.trim()
  return trimmed.length > 0 ? `\n\`\`\`\n${trimmed.slice(0, 1500)}\n\`\`\`` : ""
}

export const handleBackup = async (
  ec2: Ec2Gateway,
  ssm: SsmGateway,
  instanceId: string
): Promise<string> => {
  const instance = await ec2.describeInstance(instanceId)

  if (instance.state === "running") {
    await ssm.runCommand(instanceId, createSsmCommand("mc-command", ["save-off"]))
    await ssm.runCommand(instanceId, createSsmCommand("mc-command", ["save-all"]))

    try {
      const output = await ssm.runCommand(instanceId, createSsmCommand("mc-backup"))
      return `✅ backup を取得しました${formatOutput(output)}`
    } finally {
      await ssm.runCommand(instanceId, createSsmCommand("mc-command", ["save-on"]))
    }
  }

  if (instance.state !== "stopped") {
    throw new Error(`Cannot backup instance from state=${instance.state}`)
  }

  await ec2.startInstance(instanceId)
  await ec2.waitForState(instanceId, "running", 18, 10_000)
  await ssm.waitUntilReady(instanceId, 30, 5_000)

  try {
    const output = await ssm.runCommand(instanceId, createSsmCommand("mc-backup"))
    return `✅ backup を取得しました${formatOutput(output)}`
  } finally {
    await ec2.stopInstance(instanceId)
  }
}
