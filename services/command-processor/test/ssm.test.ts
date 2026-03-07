import assert from "node:assert/strict"
import test from "node:test"

import { createSsmCommand } from "../src/aws/ssm"

test("createSsmCommand はラッパースクリプトパスを返す", () => {
  const command = createSsmCommand("mc-status")
  assert.equal(command, "/usr/local/bin/mc-status")
})
