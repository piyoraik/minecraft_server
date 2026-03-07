import { existsSync } from "node:fs"
import path from "node:path"

import * as lambda from "aws-cdk-lib/aws-lambda"
import * as logs from "aws-cdk-lib/aws-logs"

export const PROJECT_TAG_VALUE = "minecraft-server"
export const LOG_RETENTION = logs.RetentionDays.TWO_WEEKS

export const createLogPolicyResources = (logGroup: logs.ILogGroup): string[] => {
  return [logGroup.logGroupArn, `${logGroup.logGroupArn}:*`]
}

export const getCfnFunction = (lambdaFunction: lambda.Function): lambda.CfnFunction => {
  const defaultChild = lambdaFunction.node.defaultChild
  if (!(defaultChild instanceof lambda.CfnFunction)) {
    throw new Error("Lambda default child is not CfnFunction")
  }

  return defaultChild
}

export const getCfnLogGroup = (logGroup: logs.LogGroup): logs.CfnLogGroup => {
  const defaultChild = logGroup.node.defaultChild
  if (!(defaultChild instanceof logs.CfnLogGroup)) {
    throw new Error("LogGroup default child is not CfnLogGroup")
  }

  return defaultChild
}

const resolveServiceDistPath = (serviceName: string): string => {
  return path.resolve(process.cwd(), "../..", "services", serviceName, "dist")
}

export const createLambdaCode = (serviceName: string, fallbackCode: string): lambda.Code => {
  const distPath = resolveServiceDistPath(serviceName)
  if (existsSync(distPath)) {
    return lambda.Code.fromAsset(distPath)
  }

  // dist が未生成でも synth を可能にし、開発初期のフィードバックを速くする。
  return lambda.Code.fromInline(fallbackCode)
}
