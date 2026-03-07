import {
  GetCommandInvocationCommand,
  SSMClient,
  SendCommandCommand
} from "@aws-sdk/client-ssm"

export type SsmGateway = {
  runCommand: (instanceId: string, command: string) => Promise<string>
  waitUntilReady: (instanceId: string, maxAttempts: number, intervalMs: number) => Promise<void>
}

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

const shellEscape = (value: string): string => {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

export const createSsmCommand = (
  commandName: "mc-start" | "mc-stop" | "mc-status" | "mc-command",
  args: string[] = []
): string => {
  const escapedArgs = args.map((arg) => shellEscape(arg)).join(" ")
  return escapedArgs.length > 0 ? `/usr/local/bin/${commandName} ${escapedArgs}` : `/usr/local/bin/${commandName}`
}

export const createSsmGateway = (client: SSMClient = new SSMClient({})): SsmGateway => {
  const isInstanceNotReadyError = (error: unknown): boolean => {
    return (
      error instanceof Error &&
      (error.name === "InvalidInstanceId" || error.name === "TargetNotConnected")
    )
  }

  const runCommand = async (instanceId: string, command: string): Promise<string> => {
    const sendResult = await client.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: "AWS-RunShellScript",
        Parameters: {
          commands: [command]
        }
      })
    )

    const commandId = sendResult.Command?.CommandId
    if (typeof commandId !== "string" || commandId.length === 0) {
      throw new Error("Failed to issue SSM command")
    }

    for (let i = 0; i < 30; i += 1) {
      await sleep(2000)

      try {
        const result = await client.send(
          new GetCommandInvocationCommand({
            CommandId: commandId,
            InstanceId: instanceId
          })
        )

        if (result.Status === "Success") {
          return result.StandardOutputContent ?? ""
        }

        if (result.Status === "Failed" || result.Status === "Cancelled" || result.Status === "TimedOut") {
          throw new Error(`SSM command failed: ${result.Status}`)
        }
      } catch (error) {
        if (error instanceof Error && error.name === "InvocationDoesNotExist") {
          continue
        }
        throw error
      }
    }

    throw new Error("SSM command polling timeout")
  }

  const waitUntilReady = async (
    instanceId: string,
    maxAttempts: number,
    intervalMs: number
  ): Promise<void> => {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        await runCommand(instanceId, "true")
        return
      } catch (error) {
        if (isInstanceNotReadyError(error)) {
          await sleep(intervalMs)
          continue
        }

        throw error
      }
    }

    throw new Error("SSM did not become ready in time")
  }

  return {
    runCommand,
    waitUntilReady
  }
}
