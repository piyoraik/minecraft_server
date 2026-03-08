import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda"
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager"
import {
  createSecretResolver,
  logger,
  readRequiredEnv,
  type CommandPayload
} from "@minecraft/shared"

import { buildPayload } from "./router"
import { verifyDiscordRequest } from "./verify"

type LambdaEvent = {
  body?: string | null
  headers?: Record<string, string | undefined>
  isBase64Encoded?: boolean
}

type LambdaResult = {
  statusCode: number
  headers: Record<string, string>
  body: string
}

type DiscordInteraction = {
  type?: number
  token?: string
  data?: {
    name?: string
    options?: Array<{ name?: string }>
  }
  member?: {
    user?: {
      id?: string
    }
  }
  user?: {
    id?: string
  }
}

type HandlerDeps = {
  getSecretValue: (secretArn: string) => Promise<string>
  invokeProcessor: (functionName: string, payload: CommandPayload) => Promise<void>
}

class InvalidRequestError extends Error {}

const JSON_HEADERS = {
  "content-type": "application/json"
}

const createDiscordResponse = (body: object): LambdaResult => {
  return {
    statusCode: 200,
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  }
}

const createErrorResponse = (statusCode: number, message: string): LambdaResult => {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify({ message })
  }
}

const isDiscordInteraction = (value: unknown): value is DiscordInteraction => {
  return typeof value === "object" && value !== null
}

const parseInteraction = (body: string): DiscordInteraction => {
  const parsed: unknown = JSON.parse(body)
  if (!isDiscordInteraction(parsed)) {
    throw new InvalidRequestError("Invalid interaction body")
  }
  return parsed
}

const normalizeRequestBody = (event: LambdaEvent): string | null => {
  const body = event.body
  if (typeof body !== "string" || body.length === 0) {
    return null
  }

  if (event.isBase64Encoded === true) {
    return Buffer.from(body, "base64").toString("utf-8")
  }

  return body
}

const createDefaultDeps = (): HandlerDeps => {
  const lambdaClient = new LambdaClient({})
  const getSecretValue = createSecretResolver(new SecretsManagerClient({}))

  const invokeProcessor = async (functionName: string, payload: CommandPayload): Promise<void> => {
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: functionName,
        InvocationType: "Event",
        Payload: Buffer.from(JSON.stringify(payload))
      })
    )
  }

  return {
    getSecretValue,
    invokeProcessor
  }
}

/**
 * Discord の 3 秒制約を守るため、署名検証と受理応答だけをこのハンドラに閉じ込める。
 * 実コマンドを別 Lambda へ委譲し、遅い処理で受付失敗しない構成にする。
 */
export const createHandler = (deps: HandlerDeps) => {
  return async (event: LambdaEvent): Promise<LambdaResult> => {
    try {
      logger.info("discord-handler request received", {
        hasBody: typeof event.body === "string" && event.body.length > 0,
        isBase64Encoded: event.isBase64Encoded === true,
        headerKeys: Object.keys(event.headers ?? {})
      })

      const env = readRequiredEnv([
        "DISCORD_PUBLIC_KEY_SECRET_ARN",
        "DISCORD_APP_ID_SECRET_ARN",
        "PROCESSOR_FUNCTION_NAME"
      ] as const)

      const body = normalizeRequestBody(event)
      if (body === null) {
        return createErrorResponse(400, "Missing request body")
      }

      const [discordPublicKey, applicationId] = await Promise.all([
        deps.getSecretValue(env.DISCORD_PUBLIC_KEY_SECRET_ARN),
        deps.getSecretValue(env.DISCORD_APP_ID_SECRET_ARN)
      ])
      logger.info("discord-handler secrets loaded")

      const headers = event.headers ?? {}
      const isValidRequest = verifyDiscordRequest({
        body,
        headers,
        discordPublicKeyHex: discordPublicKey
      })
      if (!isValidRequest) {
        logger.warn("discord-handler signature validation failed")
        return createErrorResponse(401, "Invalid request signature")
      }

      const interaction = parseInteraction(body)
      logger.info("discord-handler interaction parsed", {
        type: interaction.type,
        commandName: interaction.data?.name ?? null
      })

      if (interaction.type === 1) {
        logger.info("discord-handler responding to ping")
        return createDiscordResponse({ type: 1 })
      }

      const payload = buildPayload(interaction, applicationId)
      await deps.invokeProcessor(env.PROCESSOR_FUNCTION_NAME, payload)
      logger.info("discord-handler processor invoked", {
        commandName: payload.commandName,
        userId: payload.userId
      })

      return createDiscordResponse({ type: 5 })
    } catch (error) {
      if (error instanceof InvalidRequestError || error instanceof SyntaxError) {
        return createErrorResponse(400, "Bad request")
      }
      if (error instanceof Error && error.message.includes("Missing")) {
        return createErrorResponse(400, error.message)
      }

      logger.error("discord-handler failed", { error })
      return createErrorResponse(500, "Internal server error")
    }
  }
}

export const handler = createHandler(createDefaultDeps())
