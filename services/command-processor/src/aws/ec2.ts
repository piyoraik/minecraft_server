import {
  DescribeInstancesCommand,
  EC2Client,
  type Instance,
  StartInstancesCommand,
  StopInstancesCommand
} from "@aws-sdk/client-ec2"

export type Ec2State =
  | "pending"
  | "running"
  | "shutting-down"
  | "terminated"
  | "stopping"
  | "stopped"
  | "unknown"

export type InstanceDescription = {
  instanceId: string
  state: Ec2State
  publicIp: string | null
}

export type Ec2Gateway = {
  describeInstance: (instanceId: string) => Promise<InstanceDescription>
  findInstanceByProjectTag: (tagValue: string) => Promise<InstanceDescription>
  startInstance: (instanceId: string) => Promise<void>
  stopInstance: (instanceId: string) => Promise<void>
  waitForState: (instanceId: string, targetState: Ec2State, maxAttempts: number, intervalMs: number) => Promise<void>
}

const parseState = (stateName: string | undefined): Ec2State => {
  switch (stateName) {
    case "pending":
    case "running":
    case "shutting-down":
    case "terminated":
    case "stopping":
    case "stopped":
      return stateName
    default:
      return "unknown"
  }
}

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export const createEc2Gateway = (client: EC2Client = new EC2Client({})): Ec2Gateway => {
  const toInstanceDescription = (instance: Instance | undefined): InstanceDescription => {
    if (!instance) {
      throw new Error("EC2 instance is missing")
    }

    if (!instance.InstanceId) {
      throw new Error("EC2 instance id is missing")
    }

    return {
      instanceId: instance.InstanceId,
      state: parseState(instance.State?.Name),
      publicIp: instance.PublicIpAddress ?? null
    }
  }

  const describeInstance = async (instanceId: string): Promise<InstanceDescription> => {
    const result = await client.send(
      new DescribeInstancesCommand({
        InstanceIds: [instanceId]
      })
    )

    const reservation = result.Reservations?.[0]
    const instance = reservation?.Instances?.[0]
    if (!instance) {
      throw new Error(`EC2 instance not found: ${instanceId}`)
    }

    return toInstanceDescription(instance)
  }

  const findInstanceByProjectTag = async (tagValue: string): Promise<InstanceDescription> => {
    const result = await client.send(
      new DescribeInstancesCommand({
        Filters: [
          {
            Name: "tag:Project",
            Values: [tagValue]
          },
          {
            Name: "instance-state-name",
            Values: ["pending", "running", "stopping", "stopped"]
          }
        ]
      })
    )

    const instances =
      result.Reservations?.flatMap((reservation) => reservation.Instances ?? []).filter(
        (instance) => instance.InstanceId
      ) ?? []

    if (instances.length === 0) {
      throw new Error(`EC2 instance not found for Project tag: ${tagValue}`)
    }

    if (instances.length > 1) {
      const instanceIds = instances.map((instance) => instance.InstanceId).join(", ")
      throw new Error(`Multiple EC2 instances found for Project tag ${tagValue}: ${instanceIds}`)
    }

    const [instance] = instances
    return toInstanceDescription(instance)
  }

  const startInstance = async (instanceId: string): Promise<void> => {
    await client.send(
      new StartInstancesCommand({
        InstanceIds: [instanceId]
      })
    )
  }

  const stopInstance = async (instanceId: string): Promise<void> => {
    await client.send(
      new StopInstancesCommand({
        InstanceIds: [instanceId]
      })
    )
  }

  const waitForState = async (
    instanceId: string,
    targetState: Ec2State,
    maxAttempts: number,
    intervalMs: number
  ): Promise<void> => {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const state = (await describeInstance(instanceId)).state
      if (state === targetState) {
        return
      }
      await sleep(intervalMs)
    }

    throw new Error(`Timed out waiting for EC2 state=${targetState}`)
  }

  return {
    describeInstance,
    findInstanceByProjectTag,
    startInstance,
    stopInstance,
    waitForState
  }
}
