import assert from "node:assert/strict"
import test from "node:test"

import { buildPayload, parseCommandName } from "../src/router"

test("parseCommandName はサブコマンドを優先して返す", () => {
  const commandName = parseCommandName({
    data: {
      name: "mc",
      options: [{ name: "start" }]
    }
  })

  assert.equal(commandName, "start")
})

test("buildPayload は必要項目をまとめる", () => {
  const payload = buildPayload(
    {
      token: "token-1",
      data: {
        name: "mc",
        options: [{ name: "status" }]
      },
      member: {
        user: {
          id: "user-1"
        }
      }
    },
    "app-1"
  )

  assert.deepEqual(payload, {
    commandName: "status",
    applicationId: "app-1",
    interactionToken: "token-1",
    userId: "user-1"
  })
})

test("buildPayload は restore をまとめる", () => {
  const payload = buildPayload(
    {
      token: "token-1",
      data: {
        name: "mc",
        options: [{ name: "restore" }]
      },
      member: {
        user: {
          id: "user-1"
        }
      }
    },
    "app-1"
  )

  assert.deepEqual(payload, {
    commandName: "restore",
    applicationId: "app-1",
    interactionToken: "token-1",
    userId: "user-1"
  })
})

test("buildPayload は cmd 引数をまとめる", () => {
  const payload = buildPayload(
    {
      token: "token-1",
      data: {
        name: "mc",
        options: [
          {
            name: "cmd",
            options: [{ name: "command", value: "list" }]
          }
        ]
      },
      member: {
        user: {
          id: "user-1"
        }
      }
    },
    "app-1"
  )

  assert.deepEqual(payload, {
    commandName: "cmd",
    commandArgument: "list",
    applicationId: "app-1",
    interactionToken: "token-1",
    userId: "user-1"
  })
})

test("buildPayload は whitelist add 引数をまとめる", () => {
  const payload = buildPayload(
    {
      token: "token-1",
      data: {
        name: "mc",
        options: [
          {
            name: "whitelist",
            options: [
              {
                name: "add",
                options: [{ name: "player", value: "Steve" }]
              }
            ]
          }
        ]
      },
      member: {
        user: {
          id: "user-1"
        }
      }
    },
    "app-1"
  )

  assert.deepEqual(payload, {
    commandName: "whitelist",
    whitelistAction: "add",
    playerName: "Steve",
    applicationId: "app-1",
    interactionToken: "token-1",
    userId: "user-1"
  })
})

test("buildPayload は admin grant 引数をまとめる", () => {
  const payload = buildPayload(
    {
      token: "token-1",
      data: {
        name: "mc",
        options: [
          {
            name: "admin",
            options: [
              {
                name: "grant",
                options: [{ name: "player", value: "Steve" }]
              }
            ]
          }
        ]
      },
      member: {
        user: {
          id: "user-1"
        }
      }
    },
    "app-1"
  )

  assert.deepEqual(payload, {
    commandName: "admin",
    adminAction: "grant",
    playerName: "Steve",
    applicationId: "app-1",
    interactionToken: "token-1",
    userId: "user-1"
  })
})

test("buildPayload は gamemode 引数をまとめる", () => {
  const payload = buildPayload(
    {
      token: "token-1",
      data: {
        name: "mc",
        options: [
          {
            name: "gamemode",
            options: [{ name: "creative" }]
          }
        ]
      },
      member: {
        user: {
          id: "user-1"
        }
      }
    },
    "app-1"
  )

  assert.deepEqual(payload, {
    commandName: "gamemode",
    gameMode: "creative",
    applicationId: "app-1",
    interactionToken: "token-1",
    userId: "user-1"
  })
})

test("buildPayload は playtime player 引数をまとめる", () => {
  const payload = buildPayload(
    {
      token: "token-1",
      data: {
        name: "mc",
        options: [
          {
            name: "playtime",
            options: [
              {
                name: "player",
                options: [{ name: "player", value: "Steve" }]
              }
            ]
          }
        ]
      },
      member: {
        user: {
          id: "user-1"
        }
      }
    },
    "app-1"
  )

  assert.deepEqual(payload, {
    commandName: "playtime",
    playtimeAction: "player",
    playerName: "Steve",
    applicationId: "app-1",
    interactionToken: "token-1",
    userId: "user-1"
  })
})

test("buildPayload は未対応コマンドで失敗する", () => {
  assert.throws(() => {
    buildPayload(
      {
        token: "token-1",
        data: {
          name: "mc",
          options: [{ name: "unknown" }]
        },
        user: {
          id: "user-1"
        }
      },
      "app-1"
    )
  }, /Unsupported command/)
})
