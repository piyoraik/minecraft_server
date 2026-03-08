import type { RemovalPolicy } from "aws-cdk-lib"

export type AppConfig = {
  projectName: string
  environmentName: string
  region: string
  tags: {
    ManagedBy: string
    Owner: string
    Project: string
    Environment: string
  }
  compute: {
    instanceType: string
    gracefulShutdownTimeoutSeconds: number
  }
  network: {
    minecraftPort: number
  }
  removalPolicies: {
    logs: RemovalPolicy
    secrets: RemovalPolicy
    stateful: RemovalPolicy
  }
}
