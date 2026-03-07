import assert from "node:assert/strict"
import { gzipSync } from "node:zlib"
import test from "node:test"

import { applyPlayerEvent, createHandler, extractPlayerEvents } from "../src/index"

type PlayerStatsRecord = {
  playerName: string
  online: boolean
  totalPlaySeconds: number
  currentSessionStartedAt: number | null
  lastJoinAt: number | null
  lastLeaveAt: number | null
  joinCount: number
}

test("extractPlayerEvents は joined/left ログだけを抽出する", () => {
  const events = extractPlayerEvents({
    logGroup: "/minecraft/ec2/minecraft-server",
    logStream: "i-123",
    messageType: "DATA_MESSAGE",
    logEvents: [
      {
        id: "1",
        timestamp: 1_700_000_000_000,
        message: "[16:52:29] [Server thread/INFO]: Steve joined the game"
      },
      {
        id: "2",
        timestamp: 1_700_000_100_000,
        message: "[16:55:00] [Server thread/INFO]: Steve left the game"
      },
      {
        id: "3",
        timestamp: 1_700_000_200_000,
        message: "[16:56:00] [Server thread/INFO]: Done (11.562s)!"
      }
    ]
  })

  assert.deepEqual(events, [
    {
      playerName: "Steve",
      eventType: "join",
      timestamp: 1_700_000_000_000
    },
    {
      playerName: "Steve",
      eventType: "leave",
      timestamp: 1_700_000_100_000
    }
  ])
})

test("applyPlayerEvent は join/leave で累積時間を更新する", async () => {
  const records = new Map<string, PlayerStatsRecord>()
  const notifications: string[] = []

  const deps = {
    store: {
      get: async (playerName: string) => records.get(playerName) ?? null,
      put: async (record: PlayerStatsRecord) => {
        records.set(record.playerName, record)
      }
    },
    getWebhookUrl: async () => "https://example.invalid/webhook",
    notify: async (_webhookUrl: string, message: string) => {
      notifications.push(message)
    }
  }

  await applyPlayerEvent(
    {
      playerName: "Steve",
      eventType: "join",
      timestamp: 1_700_000_000_000
    },
    deps
  )

  await applyPlayerEvent(
    {
      playerName: "Steve",
      eventType: "leave",
      timestamp: 1_700_000_090_000
    },
    deps
  )

  const record = records.get("Steve")
  assert.ok(record)
  assert.equal(record.online, false)
  assert.equal(record.totalPlaySeconds, 90)
  assert.equal(record.joinCount, 1)
  assert.equal(notifications.length, 2)
  assert.match(notifications[0] ?? "", /joined the game/)
  assert.match(notifications[1] ?? "", /session 1m 30s/)
})

test("handler は CloudWatch Logs event を処理する", async () => {
  const processed: string[] = []
  const handler = createHandler({
    store: {
      get: async () => null,
      put: async (record) => {
        processed.push(record.playerName)
      }
    },
    getWebhookUrl: async () => "https://example.invalid/webhook",
    notify: async () => Promise.resolve()
  })

  const payload = {
    logGroup: "/minecraft/ec2/minecraft-server",
    logStream: "i-123",
    messageType: "DATA_MESSAGE",
    logEvents: [
      {
        id: "1",
        timestamp: 1_700_000_000_000,
        message: "[16:52:29] [Server thread/INFO]: Steve joined the game"
      }
    ]
  }

  await handler({
    awslogs: {
      data: gzipSync(Buffer.from(JSON.stringify(payload))).toString("base64")
    }
  })

  assert.deepEqual(processed, ["Steve"])
})
