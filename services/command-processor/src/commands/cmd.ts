import type { CommandPayload } from "@minecraft/shared"
import type { Ec2Gateway } from "../aws/ec2"
import { createSsmCommand, type SsmGateway } from "../aws/ssm"

const ALLOWED_COMMAND_PATTERNS: readonly RegExp[] = [
  /^list$/i,
  /^say\s+.+$/i,
  /^save-all$/i,
  /^save-on$/i,
  /^save-off$/i,
  /^time set (day|night|noon|midnight)$/i,
  /^weather (clear|rain|thunder)$/i,
  /^difficulty (peaceful|easy|normal|hard)$/i
]

const normalizeCommandArgument = (commandArgument: string): string => {
  return commandArgument.trim().replace(/^\/+/, "").replace(/\s+/g, " ")
}

const isAllowedCommand = (commandArgument: string): boolean => {
  return ALLOWED_COMMAND_PATTERNS.some((pattern) => pattern.test(commandArgument))
}

const shorten = (value: string): string => {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return "(no output)"
  }

  if (trimmed.length <= 1500) {
    return trimmed
  }

  return `${trimmed.slice(0, 1500)}...`
}

export const handleCmd = async (
  payload: Extract<CommandPayload, { commandName: "cmd" }>,
  ec2: Ec2Gateway,
  ssm: SsmGateway,
  instanceId: string
): Promise<string> => {
  const instance = await ec2.describeInstance(instanceId)
  if (instance.state !== "running") {
    return `⚠️ EC2 が ${instance.state} のためコマンドを実行できません`
  }

  const normalizedCommand = normalizeCommandArgument(payload.commandArgument)
  if (!isAllowedCommand(normalizedCommand)) {
    return "⚠️ 許可されていないコマンドです"
  }

  const output = await ssm.runCommand(instanceId, createSsmCommand("mc-command", [normalizedCommand]))
  return `実行コマンド: \`${normalizedCommand}\`\n\`\`\`\n${shorten(output)}\n\`\`\``
}
