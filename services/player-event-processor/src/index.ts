import { gunzipSync } from "node:zlib"

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  type AttributeValue
} from "@aws-sdk/client-dynamodb"
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager"
import { createSecretResolver } from "../../shared/src"

type CloudWatchLogsEvent = {
  awslogs: {
    data: string
  }
}

type DecodedLogsPayload = {
  logGroup: string
  logStream: string
  messageType: string
  logEvents: Array<{
    id: string
    timestamp: number
    message: string
  }>
}

const asUnknownRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== "object" || value === null) {
    return null
  }

  return value as Record<string, unknown>
}

const isDecodedLogEvent = (
  value: unknown
): value is { id: string; timestamp: number; message: string } => {
  const record = asUnknownRecord(value)
  if (record === null) {
    return false
  }

  return (
    typeof record.id === "string" &&
    typeof record.timestamp === "number" &&
    typeof record.message === "string"
  )
}

const isDecodedLogsPayload = (value: unknown): value is DecodedLogsPayload => {
  const record = asUnknownRecord(value)
  if (record === null) {
    return false
  }

  return (
    typeof record.logGroup === "string" &&
    typeof record.logStream === "string" &&
    typeof record.messageType === "string" &&
    Array.isArray(record.logEvents) &&
    record.logEvents.every((logEvent) => isDecodedLogEvent(logEvent))
  )
}

type PlayerEventType = "join" | "leave"

type PlayerEvent = {
  playerName: string
  eventType: PlayerEventType
  timestamp: number
}

type PlayerStatsRecord = {
  playerName: string
  online: boolean
  totalPlaySeconds: number
  currentSessionStartedAt: number | null
  lastJoinAt: number | null
  lastLeaveAt: number | null
  joinCount: number
}

type PlayerStatsStore = {
  get: (playerName: string) => Promise<PlayerStatsRecord | null>
  put: (record: PlayerStatsRecord) => Promise<void>
}

type HandlerDeps = {
  store: PlayerStatsStore
  getWebhookUrl: () => Promise<string>
  notify: (webhookUrl: string, message: string) => Promise<void>
}

const PLAYER_EVENT_PATTERN =
  /^\[[^\]]+\] \[[^\]]+\]: ([A-Za-z0-9_]{3,16}) (joined|left) the game$/

const buildDefaultRecord = (playerName: string): PlayerStatsRecord => {
  return {
    playerName,
    online: false,
    totalPlaySeconds: 0,
    currentSessionStartedAt: null,
    lastJoinAt: null,
    lastLeaveAt: null,
    joinCount: 0
  }
}

const formatDuration = (seconds: number): string => {
  const normalized = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(normalized / 3600)
  const minutes = Math.floor((normalized % 3600) / 60)
  const remainingSeconds = normalized % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`
  }

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`
  }

  return `${remainingSeconds}s`
}

const decodeLogsPayload = (data: string): DecodedLogsPayload => {
  const compressed = Buffer.from(data, "base64")
  const decompressed = gunzipSync(compressed).toString("utf-8")
  const parsed: unknown = JSON.parse(decompressed)
  if (!isDecodedLogsPayload(parsed)) {
    throw new Error("Invalid CloudWatch Logs payload")
  }
  return parsed
}

export const extractPlayerEvents = (payload: DecodedLogsPayload): PlayerEvent[] => {
  return payload.logEvents.flatMap((logEvent) => {
    const match = logEvent.message.match(PLAYER_EVENT_PATTERN)
    if (!match) {
      return []
    }

    const playerName = match[1]
    const eventWord = match[2]
    if (!playerName || (eventWord !== "joined" && eventWord !== "left")) {
      return []
    }

    return [
      {
        playerName,
        eventType: eventWord === "joined" ? "join" : "leave",
        timestamp: logEvent.timestamp
      }
    ]
  })
}

const createItem = (record: PlayerStatsRecord): Record<string, AttributeValue> => {
  return {
    playerName: { S: record.playerName },
    online: { BOOL: record.online },
    totalPlaySeconds: { N: String(record.totalPlaySeconds) },
    currentSessionStartedAt: record.currentSessionStartedAt === null ? { NULL: true } : { N: String(record.currentSessionStartedAt) },
    lastJoinAt: record.lastJoinAt === null ? { NULL: true } : { N: String(record.lastJoinAt) },
    lastLeaveAt: record.lastLeaveAt === null ? { NULL: true } : { N: String(record.lastLeaveAt) },
    joinCount: { N: String(record.joinCount) }
  }
}

const parseNullableNumber = (attribute: AttributeValue | undefined): number | null => {
  if (!attribute || "NULL" in attribute) {
    return null
  }

  if ("N" in attribute) {
    return Number(attribute.N)
  }

  return null
}

const parseRecord = (item: Record<string, AttributeValue> | undefined): PlayerStatsRecord | null => {
  if (!item) {
    return null
  }

  const playerName = item.playerName
  const online = item.online
  const totalPlaySeconds = item.totalPlaySeconds
  const joinCount = item.joinCount

  if (!playerName || !("S" in playerName) || !online || !("BOOL" in online) || !totalPlaySeconds || !("N" in totalPlaySeconds) || !joinCount || !("N" in joinCount)) {
    return null
  }

  return {
    playerName: playerName.S,
    online: online.BOOL,
    totalPlaySeconds: Number(totalPlaySeconds.N),
    currentSessionStartedAt: parseNullableNumber(item.currentSessionStartedAt),
    lastJoinAt: parseNullableNumber(item.lastJoinAt),
    lastLeaveAt: parseNullableNumber(item.lastLeaveAt),
    joinCount: Number(joinCount.N)
  }
}

const createPlayerStatsStore = (
  tableName: string,
  client: DynamoDBClient = new DynamoDBClient({})
): PlayerStatsStore => {
  return {
    get: async (playerName) => {
      const result = await client.send(
        new GetItemCommand({
          TableName: tableName,
          Key: {
            playerName: { S: playerName }
          }
        })
      )

      return parseRecord(result.Item)
    },
    put: async (record) => {
      await client.send(
        new PutItemCommand({
          TableName: tableName,
          Item: createItem(record)
        })
      )
    }
  }
}

const createWebhookResolver = (
  secretArn: string,
  client: SecretsManagerClient = new SecretsManagerClient({})
): (() => Promise<string>) => {
  const resolveSecret = createSecretResolver(client)
  return async () => resolveSecret(secretArn)
}

const sendWebhookNotification = async (webhookUrl: string, message: string): Promise<void> => {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      content: message
    })
  })

  if (!response.ok) {
    const responseText = await response.text()
    throw new Error(`Player event webhook failed: ${response.status} ${response.statusText} ${responseText.slice(0, 256)}`)
  }
}

/**
 * ログ由来の入退室イベントを永続化と通知に変換し、集計の整合性をこの関数で保つ。
 * PoC では player name を識別子にしているため、同一セッション内の重複 join はここで吸収する。
 */
export const applyPlayerEvent = async (
  playerEvent: PlayerEvent,
  deps: HandlerDeps
): Promise<void> => {
  const existing = (await deps.store.get(playerEvent.playerName)) ?? buildDefaultRecord(playerEvent.playerName)
  const timestampSeconds = Math.floor(playerEvent.timestamp / 1000)

  if (playerEvent.eventType === "join") {
    if (existing.online) {
      return
    }

    const nextRecord: PlayerStatsRecord = {
      ...existing,
      online: true,
      currentSessionStartedAt: timestampSeconds,
      lastJoinAt: timestampSeconds,
      joinCount: existing.joinCount + 1
    }

    await deps.store.put(nextRecord)
    const webhookUrl = await deps.getWebhookUrl()
    await deps.notify(webhookUrl, `🎮 ${playerEvent.playerName} joined the game`)
    return
  }

  const sessionStartedAt = existing.currentSessionStartedAt ?? timestampSeconds
  const sessionSeconds = Math.max(0, timestampSeconds - sessionStartedAt)
  const totalPlaySeconds = existing.totalPlaySeconds + sessionSeconds
  const nextRecord: PlayerStatsRecord = {
    ...existing,
    online: false,
    totalPlaySeconds,
    currentSessionStartedAt: null,
    lastLeaveAt: timestampSeconds
  }

  await deps.store.put(nextRecord)
  const webhookUrl = await deps.getWebhookUrl()
  await deps.notify(
    webhookUrl,
    `👋 ${playerEvent.playerName} left the game (session ${formatDuration(sessionSeconds)}, total ${formatDuration(totalPlaySeconds)})`
  )
}

/**
 * CloudWatch Logs 依存をここで閉じ、後続処理にはプレイヤーイベントだけを渡すためのハンドラを組み立てる。
 * latest.log の入退室行以外を早めに捨てることで、統計更新ロジックを単純に保つ。
 */
export const createHandler = (deps: HandlerDeps) => {
  return async (event: CloudWatchLogsEvent): Promise<void> => {
    const payload = decodeLogsPayload(event.awslogs.data)
    if (payload.messageType !== "DATA_MESSAGE") {
      return
    }

    const playerEvents = extractPlayerEvents(payload)
    for (const playerEvent of playerEvents) {
      await applyPlayerEvent(playerEvent, deps)
    }
  }
}

export const handler = createHandler({
  store: createPlayerStatsStore(
    process.env.PLAYER_STATS_TABLE_NAME ?? (() => {
      throw new Error("Missing required environment variable: PLAYER_STATS_TABLE_NAME")
    })()
  ),
  getWebhookUrl: createWebhookResolver(
    process.env.PLAYER_EVENT_WEBHOOK_SECRET_ARN ?? (() => {
      throw new Error("Missing required environment variable: PLAYER_EVENT_WEBHOOK_SECRET_ARN")
    })()
  ),
  notify: sendWebhookNotification
})
