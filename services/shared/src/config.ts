export type RequiredEnvMap<TKeys extends readonly string[]> = {
  [K in TKeys[number]]: string
}

const isNonEmptyString = (value: string | undefined): value is string => {
  return typeof value === "string" && value.trim().length > 0
}

/**
 * ハンドラ本体へ不完全な設定を持ち込まないため、必須環境変数の検証を起動直後に済ませる。
 * 空文字も設定ミスとして扱い、外部依存へ進む前に例外で止める。
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
