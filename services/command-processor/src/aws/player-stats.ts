import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
  type AttributeValue
} from "@aws-sdk/client-dynamodb"

export type PlayerStatsRecord = {
  playerName: string
  online: boolean
  totalPlaySeconds: number
  currentSessionStartedAt: number | null
  lastJoinAt: number | null
  lastLeaveAt: number | null
  joinCount: number
}

export type PlayerStatsGateway = {
  get: (playerName: string) => Promise<PlayerStatsRecord | null>
  listTop: (limit: number) => Promise<PlayerStatsRecord[]>
  closeAllOnline: (closedAtSeconds: number) => Promise<number>
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

  if (
    !playerName ||
    !("S" in playerName) ||
    !online ||
    !("BOOL" in online) ||
    !totalPlaySeconds ||
    !("N" in totalPlaySeconds) ||
    !joinCount ||
    !("N" in joinCount)
  ) {
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

/**
 * プレイヤー統計テーブルへのアクセスをここへ閉じ込め、集計ロジックから DynamoDB 詳細を隠す。
 * Lambda ハンドラと永続化を切り離し、テスト時に差し替えやすくするための境界層。
 */
export const createPlayerStatsGateway = (
  tableName: string,
  client: DynamoDBClient = new DynamoDBClient({})
): PlayerStatsGateway => {
  const getEffectiveTotalSeconds = (record: PlayerStatsRecord): number => {
    if (!record.online || record.currentSessionStartedAt === null) {
      return record.totalPlaySeconds
    }

    const currentSeconds = Math.floor(Date.now() / 1000)
    const sessionSeconds = Math.max(0, currentSeconds - Math.floor(record.currentSessionStartedAt / 1000))
    return record.totalPlaySeconds + sessionSeconds
  }

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
    listTop: async (limit) => {
      const result = await client.send(
        new ScanCommand({
          TableName: tableName
        })
      )

      return (result.Items ?? [])
        .map((item) => parseRecord(item))
        .filter((item): item is PlayerStatsRecord => item !== null)
        .sort((left, right) => getEffectiveTotalSeconds(right) - getEffectiveTotalSeconds(left))
        .slice(0, limit)
    },
    closeAllOnline: async (closedAtSeconds) => {
      // stop 時に leave ログが出ないケースを吸収するため、オンライン状態を明示的に閉じる。
      const result = await client.send(
        new ScanCommand({
          TableName: tableName
        })
      )

      const onlineRecords = (result.Items ?? [])
        .map((item) => parseRecord(item))
        .filter((item): item is PlayerStatsRecord => {
          return item !== null && item.online && item.currentSessionStartedAt !== null
        })

      await Promise.all(
        onlineRecords.map(async (record) => {
          const currentSessionStartedAt = record.currentSessionStartedAt
          if (currentSessionStartedAt === null) {
            return
          }

          const sessionSeconds = Math.max(
            0,
            closedAtSeconds - Math.floor(currentSessionStartedAt / 1000)
          )

          await client.send(
            new PutItemCommand({
              TableName: tableName,
              Item: {
                playerName: { S: record.playerName },
                online: { BOOL: false },
                totalPlaySeconds: { N: String(record.totalPlaySeconds + sessionSeconds) },
                currentSessionStartedAt: { NULL: true },
                lastJoinAt:
                  record.lastJoinAt === null ? { NULL: true } : { N: String(record.lastJoinAt) },
                lastLeaveAt: { N: String(closedAtSeconds) },
                joinCount: { N: String(record.joinCount) }
              }
            })
          )
        })
      )

      return onlineRecords.length
    }
  }
}
