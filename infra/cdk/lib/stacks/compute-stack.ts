import { CfnOutput, Duration, Stack, type StackProps } from "aws-cdk-lib"
import * as ec2 from "aws-cdk-lib/aws-ec2"
import type { Construct } from "constructs"

import type { AppConfig } from "../config/types"
import { MinecraftServerConstruct } from "../constructs/compute/minecraft-server-construct"
import { applyStandardTags } from "../helpers/tags"

export type ComputeStackProps = StackProps & {
  config: AppConfig
  elasticIp: ec2.CfnEIP
  securityGroup: ec2.ISecurityGroup
  vpc: ec2.IVpc
}

/**
 * Minecraft サーバー本体を載せる計算資源をまとめる Stack。
 *
 * @remarks
 * EC2 と IAM の詳細は Construct に委譲し、Stack では依存注入と Output に責務を絞る。
 */
export class ComputeStack extends Stack {
  public readonly instance: ec2.IInstance

  public constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props)
    applyStandardTags(this, props.config)

    const server = new MinecraftServerConstruct(this, "MinecraftServer", {
      elasticIp: props.elasticIp,
      gracefulShutdownTimeout: Duration.seconds(props.config.compute.gracefulShutdownTimeoutSeconds),
      instanceType: props.config.compute.instanceType,
      securityGroup: props.securityGroup,
      vpc: props.vpc
    })
    this.instance = server.instance

    new CfnOutput(this, "InstanceId", {
      value: server.instance.instanceId
    })

    new CfnOutput(this, "InstancePublicIp", {
      value: server.instance.instancePublicIp
    })

    new CfnOutput(this, "GracefulShutdownTimeout", {
      value: Duration.seconds(props.config.compute.gracefulShutdownTimeoutSeconds).toHumanString()
    })
  }
}
