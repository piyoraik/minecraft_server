import type { Ec2Gateway } from "../aws/ec2"
import type { PlayerStatsGateway } from "../aws/player-stats"
import { createSsmCommand, type SsmGateway } from "../aws/ssm"

export const handleStop = async (
  ec2: Ec2Gateway,
  ssm: SsmGateway,
  playerStats: PlayerStatsGateway,
  instanceId: string
): Promise<string> => {
  const instance = await ec2.describeInstance(instanceId)

  if (instance.state === "stopped") {
    return "✅ サーバーは既に停止中です"
  }

  if (instance.state !== "running") {
    throw new Error(`Cannot stop instance from state=${instance.state}`)
  }

  await ssm.runCommand(instanceId, createSsmCommand("mc-stop"))
  await playerStats.closeAllOnline(Math.floor(Date.now() / 1000))
  await ec2.stopInstance(instanceId)

  return "✅ サーバーを停止しました"
}
