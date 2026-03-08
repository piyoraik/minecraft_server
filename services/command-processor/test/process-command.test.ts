import assert from "node:assert/strict"
import test from "node:test"

import type { CommandPayload } from "@minecraft/shared"

import { processCommand } from "../src/index"

const basePayload: CommandPayload = {
  commandName: "status",
  applicationId: "app-id",
  interactionToken: "token-1",
  userId: "user-1"
}

test("status コマンド時に follow-up を送信する", async () => {
  const sentMessages: string[] = []

  await processCommand(
    basePayload,
    {
      ec2: {
        findInstanceByProjectTag: async () => ({
          instanceId: "i-123",
          state: "stopped",
          publicIp: null
        }),
        describeInstance: async () => ({ instanceId: "i-123", state: "stopped", publicIp: null }),
        startInstance: async () => Promise.resolve(),
        stopInstance: async () => Promise.resolve(),
        waitForState: async () => Promise.resolve()
      },
      ssm: {
        runCommand: async () => "",
        waitUntilReady: async () => Promise.resolve()
      },
      playerStats: {
        get: async () => null,
        listTop: async () => [],
        closeAllOnline: async () => 0
      },
      followup: {
        send: async (_appId, _token, content) => {
          sentMessages.push(content)
        }
      }
    },
    "i-123"
  )

  assert.equal(sentMessages.length, 1)
  const firstMessage = sentMessages[0]
  assert.ok(firstMessage)
  assert.match(firstMessage, /EC2: stopped/)
})

test("status コマンドは Minecraft Server Details のみ返し、RCON password を含めない", async () => {
  const sentMessages: string[] = []

  await processCommand(
    basePayload,
    {
      ec2: {
        findInstanceByProjectTag: async () => ({
          instanceId: "i-123",
          state: "running",
          publicIp: "54.150.85.48"
        }),
        describeInstance: async () => ({
          instanceId: "i-123",
          state: "running",
          publicIp: "54.150.85.48"
        }),
        startInstance: async () => Promise.resolve(),
        stopInstance: async () => Promise.resolve(),
        waitForState: async () => Promise.resolve()
      },
      ssm: {
        runCommand: async () => `
Distro Details
====
ignored

Minecraft Server Details
====
Server name:    Minecraft Server
Branch:         release
Server IP:      0.0.0.0:25565
Internet IP:    54.150.85.48:25565
Query enabled:  true
RCON password:  secret
Maxplayers:     20
Status:         STARTED

mcserver Script Details
====
ignored
        `,
        waitUntilReady: async () => Promise.resolve()
      },
      playerStats: {
        get: async () => null,
        listTop: async () => [],
        closeAllOnline: async () => 0
      },
      followup: {
        send: async (_appId, _token, content) => {
          sentMessages.push(content)
        }
      }
    },
    "minecraft-server"
  )

  assert.equal(sentMessages.length, 1)
  const firstMessage = sentMessages[0]
  assert.ok(firstMessage)
  assert.match(firstMessage, /Minecraft Server Details/)
  assert.doesNotMatch(firstMessage, /RCON password:/)
  assert.doesNotMatch(firstMessage, /Distro Details/)
  assert.doesNotMatch(firstMessage, /mcserver Script Details/)
})

test("コマンド失敗時はエラー follow-up を送信する", async () => {
  const sentMessages: string[] = []
  await assert.rejects(async () => {
    await processCommand(
      {
        ...basePayload,
        commandName: "start"
      },
      {
        ec2: {
          findInstanceByProjectTag: async () => ({
            instanceId: "i-123",
            state: "terminated",
            publicIp: null
          }),
          describeInstance: async () => ({ instanceId: "i-123", state: "terminated", publicIp: null }),
          startInstance: async () => Promise.resolve(),
          stopInstance: async () => Promise.resolve(),
          waitForState: async () => Promise.resolve()
        },
        ssm: {
          runCommand: async () => "",
          waitUntilReady: async () => Promise.resolve()
        },
        playerStats: {
          get: async () => null,
          listTop: async () => [],
          closeAllOnline: async () => 0
        },
        followup: {
          send: async (_appId, _token, content) => {
            sentMessages.push(content)
          }
        }
      },
      "i-123"
    )
  })

  assert.equal(sentMessages.length, 1)
  const firstMessage = sentMessages[0]
  assert.ok(firstMessage)
  assert.equal(firstMessage, "⚠️ コマンド処理中にエラーが発生しました")
})

test("cmd コマンドは allowlist 対象を実行する", async () => {
  const sentMessages: string[] = []

  await processCommand(
    {
      commandName: "cmd",
      commandArgument: "list",
      applicationId: "app-id",
      interactionToken: "token-1",
      userId: "user-1"
    },
    {
      ec2: {
        findInstanceByProjectTag: async () => ({
          instanceId: "i-123",
          state: "running",
          publicIp: "54.150.85.48"
        }),
        describeInstance: async () => ({
          instanceId: "i-123",
          state: "running",
          publicIp: "54.150.85.48"
        }),
        startInstance: async () => Promise.resolve(),
        stopInstance: async () => Promise.resolve(),
        waitForState: async () => Promise.resolve()
      },
      ssm: {
        runCommand: async (_instanceId, command) => {
          assert.match(command, /\/usr\/local\/bin\/mc-command 'list'/)
          return "There are 0 of a max of 20 players online"
        },
        waitUntilReady: async () => Promise.resolve()
      },
      playerStats: {
        get: async () => null,
        listTop: async () => [],
        closeAllOnline: async () => 0
      },
      followup: {
        send: async (_appId, _token, content) => {
          sentMessages.push(content)
        }
      }
    },
    "minecraft-server"
  )

  assert.equal(sentMessages.length, 1)
  const firstMessage = sentMessages[0]
  assert.ok(firstMessage)
  assert.match(firstMessage, /実行コマンド: `list`/)
  assert.match(firstMessage, /players online/)
})

test("cmd コマンドは allowlist 外を拒否する", async () => {
  const sentMessages: string[] = []

  await processCommand(
    {
      commandName: "cmd",
      commandArgument: "op someone",
      applicationId: "app-id",
      interactionToken: "token-1",
      userId: "user-1"
    },
    {
      ec2: {
        findInstanceByProjectTag: async () => ({
          instanceId: "i-123",
          state: "running",
          publicIp: "54.150.85.48"
        }),
        describeInstance: async () => ({
          instanceId: "i-123",
          state: "running",
          publicIp: "54.150.85.48"
        }),
        startInstance: async () => Promise.resolve(),
        stopInstance: async () => Promise.resolve(),
        waitForState: async () => Promise.resolve()
      },
      ssm: {
        runCommand: async () => {
          throw new Error("should not run")
        },
        waitUntilReady: async () => Promise.resolve()
      },
      playerStats: {
        get: async () => null,
        listTop: async () => [],
        closeAllOnline: async () => 0
      },
      followup: {
        send: async (_appId, _token, content) => {
          sentMessages.push(content)
        }
      }
    },
    "minecraft-server"
  )

  assert.equal(sentMessages.length, 1)
  const firstMessage = sentMessages[0]
  assert.ok(firstMessage)
  assert.equal(firstMessage, "⚠️ 許可されていないコマンドです")
})

test("backup コマンドは running インスタンスで save-all 後に backup を取る", async () => {
  const sentMessages: string[] = []
  const calls: string[] = []

  await processCommand(
    {
      commandName: "backup",
      applicationId: "app-id",
      interactionToken: "token-1",
      userId: "user-1"
    },
    {
      ec2: {
        findInstanceByProjectTag: async () => ({
          instanceId: "i-123",
          state: "running",
          publicIp: null
        }),
        describeInstance: async () => ({ instanceId: "i-123", state: "running", publicIp: null }),
        startInstance: async () => {
          throw new Error("should not start instance")
        },
        stopInstance: async () => {
          throw new Error("should not stop instance")
        },
        waitForState: async () => {
          throw new Error("should not wait state")
        }
      },
      ssm: {
        runCommand: async (_instanceId, command) => {
          calls.push(command)
          if (command === "/usr/local/bin/mc-backup") {
            return "backup uploaded"
          }
          return "ok"
        },
        waitUntilReady: async () => {
          throw new Error("should not wait ssm")
        }
      },
      playerStats: {
        get: async () => null,
        listTop: async () => [],
        closeAllOnline: async () => 0
      },
      followup: {
        send: async (_appId, _token, content) => {
          sentMessages.push(content)
        }
      }
    },
    "minecraft-server"
  )

  assert.deepEqual(calls, [
    "/usr/local/bin/mc-command 'save-off'",
    "/usr/local/bin/mc-command 'save-all'",
    "/usr/local/bin/mc-backup",
    "/usr/local/bin/mc-command 'save-on'"
  ])
  assert.match(sentMessages[0] ?? "", /backup を取得しました/)
})

test("backup コマンドは stopped インスタンスを一時起動して backup を取る", async () => {
  const sentMessages: string[] = []
  const calls: string[] = []

  await processCommand(
    {
      commandName: "backup",
      applicationId: "app-id",
      interactionToken: "token-1",
      userId: "user-1"
    },
    {
      ec2: {
        findInstanceByProjectTag: async () => ({
          instanceId: "i-123",
          state: "stopped",
          publicIp: null
        }),
        describeInstance: async () => ({ instanceId: "i-123", state: "stopped", publicIp: null }),
        startInstance: async () => {
          calls.push("start")
        },
        stopInstance: async () => {
          calls.push("stop")
        },
        waitForState: async () => {
          calls.push("wait-running")
        }
      },
      ssm: {
        runCommand: async (_instanceId, command) => {
          calls.push(command)
          assert.equal(command, "/usr/local/bin/mc-backup")
          return "backup uploaded"
        },
        waitUntilReady: async () => {
          calls.push("wait-ssm")
        }
      },
      playerStats: {
        get: async () => null,
        listTop: async () => [],
        closeAllOnline: async () => 0
      },
      followup: {
        send: async (_appId, _token, content) => {
          sentMessages.push(content)
        }
      }
    },
    "minecraft-server"
  )

  assert.deepEqual(calls, ["start", "wait-running", "wait-ssm", "/usr/local/bin/mc-backup", "stop"])
  assert.match(sentMessages[0] ?? "", /backup を取得しました/)
})

test("restore コマンドは stopped インスタンスを起動して restore 後に Minecraft を起動する", async () => {
  const sentMessages: string[] = []
  const calls: string[] = []

  await processCommand(
    {
      commandName: "restore",
      applicationId: "app-id",
      interactionToken: "token-1",
      userId: "user-1"
    },
    {
      ec2: {
        findInstanceByProjectTag: async () => ({
          instanceId: "i-123",
          state: "stopped",
          publicIp: null
        }),
        describeInstance: async () => ({ instanceId: "i-123", state: "stopped", publicIp: null }),
        startInstance: async () => {
          calls.push("start")
        },
        stopInstance: async () => {
          throw new Error("should not stop instance")
        },
        waitForState: async () => {
          calls.push("wait-running")
        }
      },
      ssm: {
        runCommand: async (_instanceId, command) => {
          calls.push(command)
          if (command === "/usr/local/bin/mc-restore") {
            return "backup restored"
          }
          assert.equal(command, "/usr/local/bin/mc-start")
          return "started"
        },
        waitUntilReady: async () => {
          calls.push("wait-ssm")
        }
      },
      playerStats: {
        get: async () => null,
        listTop: async () => [],
        closeAllOnline: async () => 0
      },
      followup: {
        send: async (_appId, _token, content) => {
          sentMessages.push(content)
        }
      }
    },
    "minecraft-server"
  )

  assert.deepEqual(calls, ["start", "wait-running", "wait-ssm", "/usr/local/bin/mc-restore", "/usr/local/bin/mc-start"])
  assert.equal(sentMessages.length, 1)
  assert.match(sentMessages[0] ?? "", /Minecraft を起動しました/)
})

test("restore コマンドは running インスタンスでは backup なし停止後に restore して再起動する", async () => {
  const sentMessages: string[] = []
  const calls: string[] = []

  await processCommand(
    {
      commandName: "restore",
      applicationId: "app-id",
      interactionToken: "token-1",
      userId: "user-1"
    },
    {
      ec2: {
        findInstanceByProjectTag: async () => ({
          instanceId: "i-123",
          state: "running",
          publicIp: null
        }),
        describeInstance: async () => ({ instanceId: "i-123", state: "running", publicIp: null }),
        startInstance: async () => {
          throw new Error("should not start")
        },
        stopInstance: async () => {
          throw new Error("should not stop instance")
        },
        waitForState: async () => {
          throw new Error("should not wait")
        }
      },
      ssm: {
        runCommand: async (_instanceId, command) => {
          calls.push(command)
          if (command === "/usr/local/bin/mc-stop-no-backup") {
            return "stopped"
          }
          if (command === "/usr/local/bin/mc-restore") {
            return "backup restored"
          }
          assert.equal(command, "/usr/local/bin/mc-start")
          return "started"
        },
        waitUntilReady: async () => {
          throw new Error("should not wait")
        }
      },
      playerStats: {
        get: async () => null,
        listTop: async () => [],
        closeAllOnline: async () => 0
      },
      followup: {
        send: async (_appId, _token, content) => {
          sentMessages.push(content)
        }
      }
    },
    "minecraft-server"
  )

  assert.equal(sentMessages.length, 1)
  assert.deepEqual(calls, ["/usr/local/bin/mc-stop-no-backup", "/usr/local/bin/mc-restore", "/usr/local/bin/mc-start"])
  assert.match(sentMessages[0] ?? "", /Minecraft を起動しました/)
})

test("difficulty コマンドを実行できる", async () => {
  const sentMessages: string[] = []

  await processCommand(
    {
      commandName: "difficulty",
      difficulty: "hard",
      applicationId: "app-id",
      interactionToken: "token-1",
      userId: "user-1"
    },
    {
      ec2: {
        findInstanceByProjectTag: async () => ({
          instanceId: "i-123",
          state: "running",
          publicIp: null
        }),
        describeInstance: async () => ({ instanceId: "i-123", state: "running", publicIp: null }),
        startInstance: async () => Promise.resolve(),
        stopInstance: async () => Promise.resolve(),
        waitForState: async () => Promise.resolve()
      },
      ssm: {
        runCommand: async (_instanceId, command) => {
          assert.equal(command, "/usr/local/bin/mc-command 'difficulty hard'")
          return "difficulty updated"
        },
        waitUntilReady: async () => Promise.resolve()
      },
      playerStats: {
        get: async () => null,
        listTop: async () => [],
        closeAllOnline: async () => 0
      },
      followup: {
        send: async (_appId, _token, content) => {
          sentMessages.push(content)
        }
      }
    },
    "minecraft-server"
  )

  assert.match(sentMessages[0] ?? "", /難易度を hard に変更しました/)
})

test("morning コマンドを実行できる", async () => {
  const sentMessages: string[] = []

  await processCommand(
    {
      commandName: "morning",
      applicationId: "app-id",
      interactionToken: "token-1",
      userId: "user-1"
    },
    {
      ec2: {
        findInstanceByProjectTag: async () => ({
          instanceId: "i-123",
          state: "running",
          publicIp: null
        }),
        describeInstance: async () => ({ instanceId: "i-123", state: "running", publicIp: null }),
        startInstance: async () => Promise.resolve(),
        stopInstance: async () => Promise.resolve(),
        waitForState: async () => Promise.resolve()
      },
      ssm: {
        runCommand: async (_instanceId, command) => {
          assert.equal(command, "/usr/local/bin/mc-command 'time set day'")
          return "time updated"
        },
        waitUntilReady: async () => Promise.resolve()
      },
      playerStats: {
        get: async () => null,
        listTop: async () => [],
        closeAllOnline: async () => 0
      },
      followup: {
        send: async (_appId, _token, content) => {
          sentMessages.push(content)
        }
      }
    },
    "minecraft-server"
  )

  assert.match(sentMessages[0] ?? "", /時刻を朝に変更しました/)
})

test("stop コマンド時にオンラインセッションをクローズする", async () => {
  let closedAtCallCount = 0

  await processCommand(
    {
      commandName: "stop",
      applicationId: "app-id",
      interactionToken: "token-1",
      userId: "user-1"
    },
    {
      ec2: {
        findInstanceByProjectTag: async () => ({
          instanceId: "i-123",
          state: "running",
          publicIp: "54.150.85.48"
        }),
        describeInstance: async () => ({
          instanceId: "i-123",
          state: "running",
          publicIp: "54.150.85.48"
        }),
        startInstance: async () => Promise.resolve(),
        stopInstance: async () => Promise.resolve(),
        waitForState: async () => Promise.resolve()
      },
      ssm: {
        runCommand: async (_instanceId, command) => {
          assert.match(command, /\/usr\/local\/bin\/mc-stop/)
          return "stopped"
        },
        waitUntilReady: async () => Promise.resolve()
      },
      playerStats: {
        get: async () => null,
        listTop: async () => [],
        closeAllOnline: async () => {
          closedAtCallCount += 1
          return 1
        }
      },
      followup: {
        send: async () => Promise.resolve()
      }
    },
    "minecraft-server"
  )

  assert.equal(closedAtCallCount, 1)
})

test("whitelist add コマンドを実行できる", async () => {
  const sentMessages: string[] = []

  await processCommand(
    {
      commandName: "whitelist",
      whitelistAction: "add",
      playerName: "Steve",
      applicationId: "app-id",
      interactionToken: "token-1",
      userId: "user-1"
    },
    {
      ec2: {
        findInstanceByProjectTag: async () => ({
          instanceId: "i-123",
          state: "running",
          publicIp: "54.150.85.48"
        }),
        describeInstance: async () => ({
          instanceId: "i-123",
          state: "running",
          publicIp: "54.150.85.48"
        }),
        startInstance: async () => Promise.resolve(),
        stopInstance: async () => Promise.resolve(),
        waitForState: async () => Promise.resolve()
      },
      ssm: {
        runCommand: async (_instanceId, command) => {
          assert.match(command, /whitelist add Steve/)
          return "Added Steve to the whitelist"
        },
        waitUntilReady: async () => Promise.resolve()
      },
      playerStats: {
        get: async () => null,
        listTop: async () => [],
        closeAllOnline: async () => 0
      },
      followup: {
        send: async (_appId, _token, content) => {
          sentMessages.push(content)
        }
      }
    },
    "minecraft-server"
  )

  assert.equal(sentMessages.length, 1)
  assert.match(sentMessages[0] ?? "", /whitelist add/)
})

test("admin grant コマンドを実行できる", async () => {
  const sentMessages: string[] = []

  await processCommand(
    {
      commandName: "admin",
      adminAction: "grant",
      playerName: "Steve",
      applicationId: "app-id",
      interactionToken: "token-1",
      userId: "user-1"
    },
    {
      ec2: {
        findInstanceByProjectTag: async () => ({
          instanceId: "i-123",
          state: "running",
          publicIp: "54.150.85.48"
        }),
        describeInstance: async () => ({
          instanceId: "i-123",
          state: "running",
          publicIp: "54.150.85.48"
        }),
        startInstance: async () => Promise.resolve(),
        stopInstance: async () => Promise.resolve(),
        waitForState: async () => Promise.resolve()
      },
      ssm: {
        runCommand: async (_instanceId, command) => {
          assert.match(command, /op Steve/)
          return "Made Steve a server operator"
        },
        waitUntilReady: async () => Promise.resolve()
      },
      playerStats: {
        get: async () => null,
        listTop: async () => [],
        closeAllOnline: async () => 0
      },
      followup: {
        send: async (_appId, _token, content) => {
          sentMessages.push(content)
        }
      }
    },
    "minecraft-server"
  )

  assert.equal(sentMessages.length, 1)
  assert.match(sentMessages[0] ?? "", /admin grant/)
})

test("gamemode コマンドを実行できる", async () => {
  const sentMessages: string[] = []

  await processCommand(
    {
      commandName: "gamemode",
      gameMode: "creative",
      applicationId: "app-id",
      interactionToken: "token-1",
      userId: "user-1"
    },
    {
      ec2: {
        findInstanceByProjectTag: async () => ({
          instanceId: "i-123",
          state: "running",
          publicIp: "54.150.85.48"
        }),
        describeInstance: async () => ({
          instanceId: "i-123",
          state: "running",
          publicIp: "54.150.85.48"
        }),
        startInstance: async () => Promise.resolve(),
        stopInstance: async () => Promise.resolve(),
        waitForState: async () => Promise.resolve()
      },
      ssm: {
        runCommand: async (_instanceId, command) => {
          assert.match(command, /defaultgamemode creative/)
          return "The default game mode has been updated to Creative Mode"
        },
        waitUntilReady: async () => Promise.resolve()
      },
      playerStats: {
        get: async () => null,
        listTop: async () => [],
        closeAllOnline: async () => 0
      },
      followup: {
        send: async (_appId, _token, content) => {
          sentMessages.push(content)
        }
      }
    },
    "minecraft-server"
  )

  assert.equal(sentMessages.length, 1)
  assert.match(sentMessages[0] ?? "", /ゲームモードを creative に変更しました/)
})

test("playtime player コマンドを実行できる", async () => {
  const sentMessages: string[] = []

  await processCommand(
    {
      commandName: "playtime",
      playtimeAction: "player",
      playerName: "Steve",
      applicationId: "app-id",
      interactionToken: "token-1",
      userId: "user-1"
    },
    {
      ec2: {
        findInstanceByProjectTag: async () => ({
          instanceId: "i-123",
          state: "running",
          publicIp: "54.150.85.48"
        }),
        describeInstance: async () => ({
          instanceId: "i-123",
          state: "running",
          publicIp: "54.150.85.48"
        }),
        startInstance: async () => Promise.resolve(),
        stopInstance: async () => Promise.resolve(),
        waitForState: async () => Promise.resolve()
      },
      ssm: {
        runCommand: async () => "",
        waitUntilReady: async () => Promise.resolve()
      },
      playerStats: {
        get: async () => ({
          playerName: "Steve",
          online: false,
          totalPlaySeconds: 3661,
          currentSessionStartedAt: null,
          lastJoinAt: null,
          lastLeaveAt: null,
          joinCount: 3
        }),
        listTop: async () => [],
        closeAllOnline: async () => 0
      },
      followup: {
        send: async (_appId, _token, content) => {
          sentMessages.push(content)
        }
      }
    },
    "minecraft-server"
  )

  assert.equal(sentMessages.length, 1)
  assert.match(sentMessages[0] ?? "", /Steve/)
  assert.match(sentMessages[0] ?? "", /累計プレイ時間/)
})

test("playtime top コマンドを実行できる", async () => {
  const sentMessages: string[] = []

  await processCommand(
    {
      commandName: "playtime",
      playtimeAction: "top",
      applicationId: "app-id",
      interactionToken: "token-1",
      userId: "user-1"
    },
    {
      ec2: {
        findInstanceByProjectTag: async () => ({
          instanceId: "i-123",
          state: "running",
          publicIp: "54.150.85.48"
        }),
        describeInstance: async () => ({
          instanceId: "i-123",
          state: "running",
          publicIp: "54.150.85.48"
        }),
        startInstance: async () => Promise.resolve(),
        stopInstance: async () => Promise.resolve(),
        waitForState: async () => Promise.resolve()
      },
      ssm: {
        runCommand: async () => "",
        waitUntilReady: async () => Promise.resolve()
      },
      playerStats: {
        get: async () => null,
        listTop: async () => [
          {
            playerName: "Steve",
            online: false,
            totalPlaySeconds: 7200,
            currentSessionStartedAt: null,
            lastJoinAt: null,
            lastLeaveAt: null,
            joinCount: 4
          },
          {
            playerName: "Alex",
            online: false,
            totalPlaySeconds: 3600,
            currentSessionStartedAt: null,
            lastJoinAt: null,
            lastLeaveAt: null,
            joinCount: 2
          }
        ],
        closeAllOnline: async () => 0
      },
      followup: {
        send: async (_appId, _token, content) => {
          sentMessages.push(content)
        }
      }
    },
    "minecraft-server"
  )

  assert.equal(sentMessages.length, 1)
  assert.match(sentMessages[0] ?? "", /プレイ時間ランキング/)
  assert.match(sentMessages[0] ?? "", /1\. Steve/)
})
