export type RequiredEnvMap<TKeys extends readonly string[]> = {
  [K in TKeys[number]]: string
}

const isNonEmptyString = (value: string | undefined): value is string => {
  return typeof value === "string" && value.trim().length > 0
}

/**
 * 必須環境変数を読み取り、空文字や未定義を早期に弾く。
 * Lambda ハンドラ起動直後に設定不備を検出したいため、例外で失敗させる。
 */
export const readRequiredEnv = <TKeys extends readonly string[]>(
  keys: TKeys,
  env: NodeJS.ProcessEnv = process.env
): RequiredEnvMap<TKeys> => {
  const entries: Array<[TKeys[number], string]> = []

  for (const key of keys) {
    const value = env[key]
    if (!isNonEmptyString(value)) {
      throw new Error(`Missing required environment variable: ${key}`)
    }

    entries.push([key, value])
  }

  return Object.fromEntries(entries) as RequiredEnvMap<TKeys>
}
