import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager"

export type SecretResolver = (secretArn: string) => Promise<string>

/**
 * Secrets Manager の値取得を関数化し、同一実行内ではメモリキャッシュを使い回す。
 * 署名鍵や Webhook URL のような不変値を毎回再取得しないための境界層。
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
