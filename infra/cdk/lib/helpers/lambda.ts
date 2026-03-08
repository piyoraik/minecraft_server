import path from "node:path"

import * as lambda from "aws-cdk-lib/aws-lambda"
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs"
import * as logs from "aws-cdk-lib/aws-logs"

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

export const getCfnLogGroup = (logGroup: logs.ILogGroup): logs.CfnLogGroup => {
  const defaultChild = logGroup.node.defaultChild
  if (!(defaultChild instanceof logs.CfnLogGroup)) {
    throw new Error("LogGroup default child is not CfnLogGroup")
  }

  return defaultChild
}

const resolveRepoRootPath = (): string => {
  return path.resolve(process.cwd(), "../..")
}

const resolveServiceEntryPath = (serviceName: string): string => {
  return path.resolve(resolveRepoRootPath(), "services", serviceName, "src", "index.ts")
}

/**
 * workspace 依存を含めて Lambda を自己完結した成果物にし、配布時の依存欠落を防ぐ。
 */
export const createNodejsServiceFunctionProps = (
  props: Omit<lambdaNodejs.NodejsFunctionProps, "bundling" | "depsLockFilePath" | "entry" | "handler"> & {
    serviceName: string
  }
): lambdaNodejs.NodejsFunctionProps => {
  const repoRootPath = resolveRepoRootPath()

  return {
    ...props,
    entry: resolveServiceEntryPath(props.serviceName),
    handler: "handler",
    bundling: {
      format: lambdaNodejs.OutputFormat.CJS,
      minify: false,
      sourceMap: false,
      target: "node20",
      tsconfig: path.resolve(repoRootPath, "tsconfig.base.json")
    },
    depsLockFilePath: path.resolve(repoRootPath, "package-lock.json")
  }
}
