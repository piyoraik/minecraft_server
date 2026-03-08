import { RemovalPolicy } from "aws-cdk-lib"

import type { AppConfig } from "./types"

const DEFAULT_REGION = "ap-northeast-1"
const DEFAULT_ENVIRONMENT_NAME = "dev"

export const loadAppConfig = (): AppConfig => {
  const environmentName = process.env.CDK_ENV_NAME ?? DEFAULT_ENVIRONMENT_NAME
  const region = process.env.CDK_DEFAULT_REGION ?? DEFAULT_REGION

  return {
    projectName: "minecraft",
    environmentName,
    region,
    tags: {
      ManagedBy: "cdk",
      Owner: "minecraft-team",
      Project: "minecraft-server",
      Environment: environmentName
    },
    compute: {
      instanceType: "t3.medium",
      gracefulShutdownTimeoutSeconds: 60
    },
    network: {
      minecraftPort: 25565
    },
    removalPolicies: {
      // 個人開発環境での検証を前提にしているため、log は積み上げず都度再作成を許容する。
      logs: RemovalPolicy.DESTROY,
      // PoC 段階では secret 名を固定したまま作り直せることを優先する。
      secrets: RemovalPolicy.DESTROY,
      // dev 環境の試行錯誤を優先し、状態リソースの破棄を許容する。
      stateful: RemovalPolicy.DESTROY
    }
  }
}
