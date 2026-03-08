import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib"
import type { Construct } from "constructs"

import type { AppConfig } from "../config/types"
import { applyStandardTags } from "../helpers/tags"
import { MinecraftNetworkConstruct } from "../constructs/network/minecraft-network-construct"

export type NetworkStackProps = StackProps & {
  config: AppConfig
}

/**
 * Minecraft サーバーの通信境界を定義する Stack。
 *
 * @remarks
 * ネットワークの詳細実装は Construct へ閉じ込め、Stack では接続点と Output のみを扱う。
 */
export class NetworkStack extends Stack {
  public readonly elasticIp
  public readonly securityGroup
  public readonly vpc

  private readonly network: MinecraftNetworkConstruct

  public constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props)
    applyStandardTags(this, props.config)

    this.network = new MinecraftNetworkConstruct(this, "MinecraftNetwork", {
      standardTags: props.config.tags,
      minecraftPort: props.config.network.minecraftPort
    })
    this.elasticIp = this.network.elasticIp
    this.securityGroup = this.network.securityGroup
    this.vpc = this.network.vpc

    new CfnOutput(this, "SecurityGroupId", {
      value: this.network.securityGroup.securityGroupId
    })

    new CfnOutput(this, "ElasticIpAllocationId", {
      value: this.network.elasticIp.attrAllocationId
    })
  }
}
