import assert from "node:assert/strict"
import test from "node:test"

import { readRequiredEnv } from "../src/config"

test("readRequiredEnv は必須環境変数を返す", () => {
  const env = {
    KEY_A: "value-a",
    KEY_B: "value-b"
  }

  const result = readRequiredEnv(["KEY_A", "KEY_B"], env)

  assert.deepEqual(result, {
    KEY_A: "value-a",
    KEY_B: "value-b"
  })
})

test("readRequiredEnv は空値をエラーにする", () => {
  const env = {
    KEY_A: ""
  }

  assert.throws(() => {
    readRequiredEnv(["KEY_A"], env)
  }, /Missing required environment variable: KEY_A/)
})
