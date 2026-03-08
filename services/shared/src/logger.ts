type LogContext = Record<string, unknown>

const writeLog = (level: "INFO" | "WARN" | "ERROR", message: string, context?: LogContext): void => {
  const payload = context === undefined ? { level, message } : { level, message, ...context }
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

/**
 * Lambda 関数ごとのログ形式を揃えるための最小 logger。
 * console の直接呼び出しを避け、構造化ログだけを各サービスへ渡す。
 */
export const logger = {
  info: (message: string, context?: LogContext): void => {
    writeLog("INFO", message, context)
  },
  warn: (message: string, context?: LogContext): void => {
    writeLog("WARN", message, context)
  },
  error: (message: string, context?: LogContext): void => {
    writeLog("ERROR", message, context)
  }
}
