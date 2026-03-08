import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"

export type SecretResolver = (secretArn: string) => Promise<string>

/**
 * Secrets Manager へのアクセスをここに閉じ込め、呼び出し側から SDK 詳細を隠す。
 * 署名鍵や Webhook URL のような不変値を同一実行内で再取得しないため、メモリキャッシュを併用する。
 */
export const createSecretResolver = (
  client: SecretsManagerClient = new SecretsManagerClient({})
): SecretResolver => {
  const secretCache = new Map<string, string>()

  return async (secretArn: string): Promise<string> => {
    const cachedValue = secretCache.get(secretArn)
    if (cachedValue !== undefined) {
      return cachedValue
    }

    const result = await client.send(
      new GetSecretValueCommand({
        SecretId: secretArn
      })
    )

    const secret = result.SecretString
    if (typeof secret !== "string" || secret.trim().length === 0) {
      throw new Error(`SecretString is empty: ${secretArn}`)
    }

    const trimmed = secret.trim()
    secretCache.set(secretArn, trimmed)
    return trimmed
  }
}
