import { createPublicKey, verify } from "node:crypto"

const getHeaderValue = (headers: Record<string, string | undefined>, key: string): string | undefined => {
  const lower = key.toLowerCase()
  for (const [headerName, headerValue] of Object.entries(headers)) {
    if (headerName.toLowerCase() === lower) {
      return headerValue
    }
  }
  return undefined
}

const hexToBuffer = (value: string): Buffer => {
  const normalized = value.trim().replace(/^0x/i, "")
  if (normalized.length % 2 !== 0) {
    throw new Error("Invalid hex string")
  }
  return Buffer.from(normalized, "hex")
}

export type VerifyInput = {
  body: string
  headers: Record<string, string | undefined>
  discordPublicKeyHex: string
}

export const verifyDiscordRequest = (input: VerifyInput): boolean => {
  const signature = getHeaderValue(input.headers, "x-signature-ed25519")
  const timestamp = getHeaderValue(input.headers, "x-signature-timestamp")

  if (!signature || !timestamp) {
    return false
  }

  try {
    const publicKey = createPublicKey({
      key: Buffer.concat([
        Buffer.from("302a300506032b6570032100", "hex"),
        hexToBuffer(input.discordPublicKeyHex)
      ]),
      format: "der",
      type: "spki"
    })

    return verify(
      null,
      Buffer.from(`${timestamp}${input.body}`),
      publicKey,
      hexToBuffer(signature)
    )
  } catch {
    return false
  }
}
