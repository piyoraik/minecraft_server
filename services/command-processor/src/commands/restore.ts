import type { Ec2Gateway } from "../aws/ec2"
import { createSsmCommand, type SsmGateway } from "../aws/ssm"

const formatOutput = (output: string): string => {
  const trimmed = output.trim()
  return trimmed.length > 0 ? `\n\`\`\`\n${trimmed.slice(0, 1500)}\n\`\`\`` : ""
}

/**
 * latest backup の restore だけを明示実行する。
 * restore 対象の backup を上書きしないよう、復元前停止では backup を取らない。
 * running/stopped どちらでも restore 後は Minecraft を起動し、接続可能な状態まで戻す。
 */
export const handleRestore = async (
  ec2: Ec2Gateway,
  ssm: SsmGateway,
  instanceId: string
): Promise<string> => {
  const instance = await ec2.describeInstance(instanceId)

  if (instance.state === "running") {
    await ssm.runCommand(instanceId, createSsmCommand("mc-stop-no-backup"))
    const output = await ssm.runCommand(instanceId, createSsmCommand("mc-restore"))
    await ssm.runCommand(instanceId, createSsmCommand("mc-start"))
    return `✅ latest backup を restore して Minecraft を起動しました${formatOutput(output)}`
  }

  if (instance.state !== "stopped") {
    throw new Error(`Cannot restore instance from state=${instance.state}`)
  }

  await ec2.startInstance(instanceId)
  await ec2.waitForState(instanceId, "running", 18, 10_000)
  await ssm.waitUntilReady(instanceId, 30, 5_000)

  const output = await ssm.runCommand(instanceId, createSsmCommand("mc-restore"))
  await ssm.runCommand(instanceId, createSsmCommand("mc-start"))
  return `✅ latest backup を restore して Minecraft を起動しました${formatOutput(output)}`
}
