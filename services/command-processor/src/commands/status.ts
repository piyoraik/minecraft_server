import type { Ec2Gateway } from "../aws/ec2"
import { createSsmCommand, type SsmGateway } from "../aws/ssm"

const stripAnsi = (value: string): string => {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "")
}

const extractServerDetails = (value: string): string => {
  const startMarker = "Minecraft Server Details"
  const endMarker = "mcserver Script Details"
  const sanitized = stripAnsi(value)

  const startIndex = sanitized.indexOf(startMarker)
  if (startIndex === -1) {
    return "Minecraft: status unavailable"
  }

  const endIndex = sanitized.indexOf(endMarker, startIndex)
  const section = (endIndex === -1 ? sanitized.slice(startIndex) : sanitized.slice(startIndex, endIndex)).trim()

  const filteredLines = section
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => {
      const normalized = line.trim()
      return (
        normalized.length > 0 &&
        !normalized.startsWith("RCON password:") &&
        !normalized.startsWith('tput: unknown terminal')
      )
    })

  return filteredLines.join("\n")
}

export const handleStatus = async (
  ec2: Ec2Gateway,
  ssm: SsmGateway,
  instanceId: string
): Promise<string> => {
  const instance = await ec2.describeInstance(instanceId)

  if (instance.state !== "running") {
    return `EC2: ${instance.state}\nMinecraft: stopped`
  }

  const details = await ssm.runCommand(instanceId, createSsmCommand("mc-status"))
  const endpoint = instance.publicIp ? `\n接続先: ${instance.publicIp}:25565` : ""
  const serverDetails = extractServerDetails(details)

  return `EC2: running\n\`\`\`\n${serverDetails}\n\`\`\`${endpoint}`
}
