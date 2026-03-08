import type { Ec2Gateway } from "../aws/ec2"
import { createSsmCommand, type SsmGateway } from "../aws/ssm"

const formatOutput = (output: string): string => {
  const trimmed = output.trim()
  return trimmed.length > 0 ? `\n\`\`\`\n${trimmed.slice(0, 1500)}\n\`\`\`` : ""
}

/**
 * latest backup の restore だけを明示実行する。
 * running 時は Minecraft を停止してから restore し、stopped 時は一時起動して restore 後に再停止する。
 */
export const handleRestore = async (
  ec2: Ec2Gateway,
  ssm: SsmGateway,
  instanceId: string
): Promise<string> => {
  const instance = await ec2.describeInstance(instanceId)

  if (instance.state === "running") {
    await ssm.runCommand(instanceId, createSsmCommand("mc-stop"))
    const output = await ssm.runCommand(instanceId, createSsmCommand("mc-restore"))
    return `✅ latest backup を restore しました。Minecraft は停止したままです${formatOutput(output)}`
  }

  if (instance.state !== "stopped") {
    throw new Error(`Cannot restore instance from state=${instance.state}`)
  }

  await ec2.startInstance(instanceId)
  await ec2.waitForState(instanceId, "running", 18, 10_000)
  await ssm.waitUntilReady(instanceId, 30, 5_000)

  try {
    const output = await ssm.runCommand(instanceId, createSsmCommand("mc-restore"))
    return `✅ latest backup を restore しました${formatOutput(output)}`
  } finally {
    await ec2.stopInstance(instanceId)
  }
}
