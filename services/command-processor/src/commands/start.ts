import type { Ec2Gateway } from "../aws/ec2"
import { createSsmCommand, type SsmGateway } from "../aws/ssm"

const isMinecraftRunning = (statusOutput: string): boolean => {
  const normalized = statusOutput.toLowerCase()
  return normalized.includes("status:") && normalized.includes("started")
}

export const handleStart = async (
  ec2: Ec2Gateway,
  ssm: SsmGateway,
  instanceId: string
): Promise<string> => {
  const instance = await ec2.describeInstance(instanceId)
  const endpointSuffix = instance.publicIp ? `\n接続先: ${instance.publicIp}:25565` : ""

  if (instance.state === "running") {
    const statusOutput = await ssm.runCommand(instanceId, createSsmCommand("mc-status"))
    if (isMinecraftRunning(statusOutput)) {
      return `✅ サーバーは既に起動中です${endpointSuffix}`
    }

    await ssm.runCommand(instanceId, createSsmCommand("mc-start"))
    return `✅ サーバーを起動しました${endpointSuffix}`
  }

  if (instance.state !== "stopped") {
    throw new Error(`Cannot start instance from state=${instance.state}`)
  }

  await ec2.startInstance(instanceId)
  await ec2.waitForState(instanceId, "running", 18, 10_000)
  await ssm.waitUntilReady(instanceId, 30, 5_000)

  const runningInstance = await ec2.describeInstance(instanceId)
  const statusOutput = await ssm.runCommand(instanceId, createSsmCommand("mc-status"))

  if (!isMinecraftRunning(statusOutput)) {
    await ssm.runCommand(instanceId, createSsmCommand("mc-start"))
  }

  const runningEndpointSuffix = runningInstance.publicIp ? `\n接続先: ${runningInstance.publicIp}:25565` : ""
  return `✅ サーバーを起動しました${runningEndpointSuffix}`
}
