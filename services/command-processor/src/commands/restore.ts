import type { Ec2Gateway } from "../aws/ec2"
import { createSsmCommand, type SsmGateway } from "../aws/ssm"

const formatOutput = (output: string): string => {
  const trimmed = output.trim()
  return trimmed.length > 0 ? `\n\`\`\`\n${trimmed.slice(0, 1500)}\n\`\`\`` : ""
}

/**
 * 停止中インスタンスに対して latest backup の restore だけを明示実行する。
 * 実行中サーバーへの上書きを避けるため、running 状態では拒否し、一時起動後に restore して再停止する。
 */
export const handleRestore = async (
  ec2: Ec2Gateway,
  ssm: SsmGateway,
  instanceId: string
): Promise<string> => {
  const instance = await ec2.describeInstance(instanceId)

  if (instance.state === "running") {
    return "⚠️ サーバー稼働中は restore できません。先に /mc stop を実行してください"
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
