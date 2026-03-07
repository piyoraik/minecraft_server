import assert from "node:assert/strict"
import { generateKeyPairSync, sign } from "node:crypto"
import test from "node:test"

import { createHandler } from "../src/index"

const exportRawPublicKeyHex = (): { publicKeyHex: string; privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"] } => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519")
  const spki = publicKey.export({ format: "der", type: "spki" })
  const rawPublicKey = spki.subarray(spki.length - 32)
  return {
    publicKeyHex: rawPublicKey.toString("hex"),
    privateKey
  }
}

const createSignedHeaders = (privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"], body: string) => {
  const timestamp = `${Math.floor(Date.now() / 1000)}`
  const signature = sign(null, Buffer.from(`${timestamp}${body}`), privateKey).toString("hex")

  return {
    "x-signature-ed25519": signature,
    "x-signature-timestamp": timestamp
  }
}

test("PING interaction に PONG を返す", async () => {
  const { publicKeyHex, privateKey } = exportRawPublicKeyHex()

  const handler = createHandler({
    getSecretValue: async (secretArn) => {
      if (secretArn === "arn:public") {
        return publicKeyHex
      }
      return "app-id"
    },
    invokeProcessor: async () => Promise.resolve()
  })

  process.env.DISCORD_PUBLIC_KEY_SECRET_ARN = "arn:public"
  process.env.DISCORD_APP_ID_SECRET_ARN = "arn:app"
  process.env.PROCESSOR_FUNCTION_NAME = "minecraft-command-processor"

  const body = JSON.stringify({ type: 1 })
  const headers = createSignedHeaders(privateKey, body)

  const response = await handler({
    body,
    headers
  })

  assert.equal(response.statusCode, 200)
  assert.equal(response.body, JSON.stringify({ type: 1 }))
})

test("COMMAND interaction は ACK 後に processor を invoke する", async () => {
  const { publicKeyHex, privateKey } = exportRawPublicKeyHex()
  const invocations: string[] = []

  const handler = createHandler({
    getSecretValue: async (secretArn) => {
      if (secretArn === "arn:public") {
        return publicKeyHex
      }
      return "app-id"
    },
    invokeProcessor: async (functionName, payload) => {
      invocations.push(functionName)
      assert.equal(payload.commandName, "start")
      assert.equal(payload.applicationId, "app-id")
    }
  })

  process.env.DISCORD_PUBLIC_KEY_SECRET_ARN = "arn:public"
  process.env.DISCORD_APP_ID_SECRET_ARN = "arn:app"
  process.env.PROCESSOR_FUNCTION_NAME = "minecraft-command-processor"

  const body = JSON.stringify({
    type: 2,
    token: "token-1",
    data: {
      name: "mc",
      options: [{ name: "start" }]
    },
    member: {
      user: {
        id: "user-1"
      }
    }
  })
  const headers = createSignedHeaders(privateKey, body)

  const response = await handler({ body, headers })

  assert.equal(response.statusCode, 200)
  assert.equal(response.body, JSON.stringify({ type: 5 }))
  assert.deepEqual(invocations, ["minecraft-command-processor"])
})

test("COMMAND cmd interaction は commandArgument を含めて processor を invoke する", async () => {
  const { publicKeyHex, privateKey } = exportRawPublicKeyHex()

  const handler = createHandler({
    getSecretValue: async (secretArn) => {
      if (secretArn === "arn:public") {
        return publicKeyHex
      }
      return "app-id"
    },
    invokeProcessor: async (_functionName, payload) => {
      assert.equal(payload.commandName, "cmd")
      assert.equal(payload.commandArgument, "list")
    }
  })

  process.env.DISCORD_PUBLIC_KEY_SECRET_ARN = "arn:public"
  process.env.DISCORD_APP_ID_SECRET_ARN = "arn:app"
  process.env.PROCESSOR_FUNCTION_NAME = "minecraft-command-processor"

  const body = JSON.stringify({
    type: 2,
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
  })
  const headers = createSignedHeaders(privateKey, body)

  const response = await handler({ body, headers })

  assert.equal(response.statusCode, 200)
  assert.equal(response.body, JSON.stringify({ type: 5 }))
})
